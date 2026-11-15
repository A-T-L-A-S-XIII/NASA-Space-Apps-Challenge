"""Gera o mapa de RECORRÊNCIA de alagamento a partir do histórico Sentinel-1 (desde 2014).

Passos, todos no Google Earth Engine (nada de imagem é baixado, só o resultado):
  1. Pega as cenas Sentinel-1 GRD (banda C, VV, modo IW) sobre o bbox da região, de uma
     órbita só (a mais frequente, ou --orbit), para não misturar geometrias de visada.
  2. Marca água em cada cena: VV abaixo do limiar (padrão -18 dB), com filtro de speckle
     e sem as encostas (declividade > 5°), onde a sombra do radar parece água.
  3. Água permanente = pixel com água em pelo menos 50% das cenas (o leito do rio).
  4. Fora do leito, conta em quantos MESES diferentes o pixel alagou e classifica:
     pontual (1 mês), voltou (2 a 3 meses), recorrente (4 meses ou mais).
  5. Soma a área alagada de cada mês (fora do leito), para a linha do tempo.

O raster de classes é baixado, vetorizado aqui e salvo em
app/data/sentinel1/{region_id}_recorrencia.geojson, junto com a série mensal.

Uso (dentro de backend/, com EE_PROJECT no .env e depois de `earthengine authenticate`):
    pip install -r scripts/requirements-sentinel1.txt
    python scripts/process_sentinel1.py --estimate      # só mostra órbitas e número de cenas
    python scripts/process_sentinel1.py
    python scripts/process_sentinel1.py --orbit 155 --threshold -19

O processamento é feito aqui, fora da API (decisão D-D). A API só lê o GeoJSON.
"""

import argparse
import io
import json
import os
import sys
import time
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

import httpx
import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import box, mapping, shape

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.data.regions import REGIONS  # noqa: E402

OUT_DIR = BACKEND / "app" / "data" / "sentinel1"
UTM_SOUTH_22 = 32722  # zona UTM do Vale do Taquari; pixel em metros

# Classe do raster -> rótulo, faixa de meses alagados e descrição para a API
CLASSES = {
    1: {"class": "pontual", "months_min": 1, "months_max": 1,
        "description": "Alagou em um único mês desde 2014"},
    2: {"class": "voltou", "months_min": 2, "months_max": 3,
        "description": "Alagou em 2 a 3 meses diferentes desde 2014"},
    3: {"class": "recorrente", "months_min": 4, "months_max": None,
        "description": "Alagou em 4 meses ou mais desde 2014"},
    4: {"class": "permanente", "months_min": None, "months_max": None,
        "description": "Água em pelo menos metade das passagens (leito do rio)"},
}


def log(msg: str):
    print(msg, flush=True)


def load_env():
    """Lê backend/.env para os.environ (sem sobrescrever o que já está no ambiente)."""
    env = BACKEND / ".env"
    if not env.is_file():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def init_ee():
    import ee

    project = os.environ.get("EE_PROJECT")
    if not project:
        sys.exit("Defina EE_PROJECT no backend/.env (o ID do projeto do Google Cloud ligado ao Earth Engine).")
    try:
        ee.Initialize(project=project)
    except Exception as exc:  # o ee não tem uma exceção específica para falta de login
        sys.exit(f"Não consegui entrar no Earth Engine:\n{exc}\n\n"
                 "Se for falta de login, rode `earthengine authenticate`. "
                 "Se for a API desativada, ative-a no link acima e espere alguns minutos.")
    return ee


# ------------------------------------------------------------- Earth Engine

def scenes(ee, aoi, start: str, end: str):
    return (ee.ImageCollection("COPERNICUS/S1_GRD")
            .filterBounds(aoi)
            .filterDate(start, end)
            .filter(ee.Filter.eq("instrumentMode", "IW"))
            .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
            .select("VV"))


def orbit_counts(collection) -> dict[int, int]:
    histogram = collection.aggregate_histogram("relativeOrbitNumber_start").getInfo()
    return {int(float(k)): v for k, v in histogram.items()}


def water_mask(ee, threshold: float, max_slope: float):
    """Função para .map(): cena VV (já em dB) -> 1 onde é água, 0 onde não é, mascarada fora da cena."""
    flat = ee.Terrain.slope(ee.Image("USGS/SRTMGL1_003")).lt(max_slope)

    def apply(image):
        smooth = image.focalMedian(50, "circle", "meters")
        return (smooth.lt(threshold).And(flat)
                .updateMask(image.mask())
                .rename("water")
                .copyProperties(image, ["system:time_start"]))

    return apply


def scenes_per_month(collection) -> dict[str, int]:
    """{"AAAA-MM": número de cenas}, só dos meses com cena; mês vazio quebra as contas no Earth Engine."""
    times = collection.aggregate_array("system:time_start").getInfo()
    return dict(sorted(Counter(datetime.fromtimestamp(t / 1000, timezone.utc).strftime("%Y-%m")
                               for t in times).items()))


# --------------------------------------------------------------- vetorizar

def download_tiles(classes, bbox: list[float], scale: int, tiles: int):
    """Baixa o raster em tiles x tiles pedaços e junta. O mapa inteiro de uma vez passa do limite
    de cálculo de um download direto do Earth Engine (erro 400)."""
    import ee
    import rasterio
    from rasterio.merge import merge

    lon_min, lat_min, lon_max, lat_max = bbox
    dlon, dlat = (lon_max - lon_min) / tiles, (lat_max - lat_min) / tiles
    sources = []
    for i in range(tiles):
        for j in range(tiles):
            part = [lon_min + i * dlon, lat_min + j * dlat, lon_min + (i + 1) * dlon, lat_min + (j + 1) * dlat]
            region = ee.Geometry.Rectangle(part)
            for attempt in (1, 2, 3):
                url = classes.clip(region).getDownloadURL({
                    "region": region, "scale": scale, "crs": f"EPSG:{UTM_SOUTH_22}", "format": "GEO_TIFF"})
                response = httpx.get(url, timeout=600, follow_redirects=True)
                if response.status_code == 200:
                    break
                log(f"  pedaço {len(sources) + 1}: erro {response.status_code} ({response.text[:200]}), "
                    f"tentativa {attempt}")
            response.raise_for_status()
            sources.append(rasterio.open(io.BytesIO(response.content)))
            log(f"  pedaço {len(sources)}/{tiles * tiles} ok")
    mosaic, transform = merge(sources)
    crs = sources[0].crs
    for src in sources:
        src.close()
    return mosaic[0].astype(np.uint8), transform, crs.to_epsg()


def vectorize_classes(classes: np.ndarray, transform, epsg: int, bbox: list[float], min_area_m2: float):
    """Raster de classes (UTM) -> lista de (classe, geometria lon/lat, área km²)."""
    from rasterio import features

    pixel_m = abs(transform.a)

    # Remove manchas pequenas ainda no raster (vira 0, "nunca alagou")
    min_pixels = max(1, int(min_area_m2 / (pixel_m * pixel_m)))
    classes = features.sieve(classes, size=min_pixels, connectivity=8)

    to_lonlat = Transformer.from_crs(epsg, 4326, always_xy=True)
    to_utm = Transformer.from_crs(4326, epsg, always_xy=True)
    result = []
    for value in sorted(CLASSES):
        mask = classes == value
        if not mask.any():
            continue
        polygons = [shape(g) for g, v in features.shapes(mask.astype(np.uint8), mask=mask, transform=transform)
                    if v == 1]
        geom = shapely.union_all(polygons).simplify(pixel_m, preserve_topology=True)
        geom = shapely.transform(geom, to_lonlat.transform, interleaved=False)
        geom = shapely.set_precision(geom, 1e-5).intersection(box(*bbox))
        parts = [g for g in getattr(geom, "geoms", [geom]) if g.geom_type in ("Polygon", "MultiPolygon")]
        if not parts:
            continue
        geom = shapely.union_all(parts)
        area_km2 = shapely.transform(geom, to_utm.transform, interleaved=False).area / 1e6
        result.append((value, geom, area_km2))
    return result, pixel_m


# ------------------------------------------------------------------- main

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--region", default="vale-do-taquari", choices=sorted(REGIONS))
    parser.add_argument("--start", default="2014-10-01", help="Início do histórico (padrão: 2014-10-01)")
    parser.add_argument("--end", default=date.today().isoformat(), help="Fim do histórico (padrão: hoje)")
    parser.add_argument("--orbit", type=int, help="Órbita relativa (padrão: a com mais cenas sobre a região)")
    parser.add_argument("--threshold", type=float, default=-18.0, help="Limiar em dB para água (padrão: -18)")
    parser.add_argument("--max-slope", type=float, default=5.0, help="Ignora encostas acima disto, em graus")
    parser.add_argument("--permanent", type=float, default=0.5, help="Fração de cenas com água = leito (0,5)")
    parser.add_argument("--scale", type=int, default=30, help="Pixel do resultado em metros (padrão: 30)")
    parser.add_argument("--tiles", type=int, default=4, help="Divide o download em N x N pedaços (padrão: 4)")
    parser.add_argument("--min-area-m2", type=float, default=10_000, help="Descarta manchas menores (padrão: 1 ha)")
    parser.add_argument("--estimate", action="store_true", help="Só mostra órbitas e número de cenas")
    args = parser.parse_args()

    started = time.monotonic()
    load_env()
    ee = init_ee()
    region = REGIONS[args.region]
    aoi = ee.Geometry.Rectangle(region["bbox"])

    all_scenes = scenes(ee, aoi, args.start, args.end)
    counts = orbit_counts(all_scenes)
    if not counts:
        sys.exit("Nenhuma cena Sentinel-1 sobre a região nesse período.")
    log("Cenas por órbita relativa: " + ", ".join(f"{o}: {n}" for o, n in sorted(counts.items(), key=lambda x: -x[1])))
    orbit = args.orbit or max(counts, key=counts.get)
    if orbit not in counts:
        sys.exit(f"A órbita {orbit} não tem cenas sobre a região.")
    collection = all_scenes.filter(ee.Filter.eq("relativeOrbitNumber_start", orbit))
    first = collection.sort("system:time_start").first()
    info = ee.Dictionary({
        "pass": first.get("orbitProperties_pass"),
        "first": ee.Date(collection.aggregate_min("system:time_start")).format("YYYY-MM-dd"),
        "last": ee.Date(collection.aggregate_max("system:time_start")).format("YYYY-MM-dd"),
    }).getInfo()
    log(f"Órbita {orbit} ({info['pass']}): {counts[orbit]} cenas, de {info['first']} a {info['last']}")
    if args.estimate:
        return

    water = collection.map(water_mask(ee, args.threshold, args.max_slope))
    permanent = water.mean().gte(args.permanent)

    per_month = scenes_per_month(collection)

    def monthly(month):
        start = ee.Date.parse("YYYY-MM", month)
        in_month = water.filterDate(start, start.advance(1, "month"))
        return in_month.max().And(permanent.Not()).unmask(0).rename("flooded")

    by_month = ee.ImageCollection.fromImages(ee.List(list(per_month)).map(monthly))
    times_flooded = by_month.sum()
    classes = (ee.Image(0)
               .where(times_flooded.eq(1), 1)
               .where(times_flooded.gte(2).And(times_flooded.lte(3)), 2)
               .where(times_flooded.gte(4), 3)
               .where(permanent, 4)
               .toByte().rename("class"))

    log(f"Baixando o raster de classes em {args.tiles * args.tiles} pedaços...")
    raster, transform, epsg = download_tiles(classes, region["bbox"], args.scale, args.tiles)
    log(f"Raster: {raster.shape[1]} x {raster.shape[0]} pixels  ({(time.monotonic() - started) / 60:.1f} min)")

    log("Calculando a série mensal no Earth Engine...")
    # Uma banda por mês e uma soma só: uma conta por mês estoura o limite de contas simultâneas
    bands = [f"m{m}" for m in per_month]
    areas = (by_month.toBands().rename(bands).multiply(ee.Image.pixelArea())
             .reduceRegion(reducer=ee.Reducer.sum(), geometry=aoi, scale=60, maxPixels=1e10).getInfo())
    monthly_rows = [{"month": m, "images": n, "flooded_km2": round((areas.get(f"m{m}") or 0) / 1e6, 2)}
                    for m, n in per_month.items()]
    log(f"Série pronta  ({(time.monotonic() - started) / 60:.1f} min)")

    vectors, pixel_m = vectorize_classes(raster, transform, epsg, region["bbox"], args.min_area_m2)
    if not vectors:
        sys.exit("Nenhuma água detectada. Tente outro --threshold.")

    metadata = {
        "source": "sentinel-1",
        "region_id": region["id"],
        "collection": "COPERNICUS/S1_GRD",
        "relative_orbit": orbit,
        "orbit_pass": info["pass"],
        "polarization": "VV",
        "period": {"start": info["first"], "end": info["last"]},
        "images": counts[orbit],
        "months_observed": len(monthly_rows),
        "threshold_db": args.threshold,
        "max_slope_deg": args.max_slope,
        "permanent_fraction": args.permanent,
        "pixel_size_m": round(pixel_m, 1),
        "min_area_m2": args.min_area_m2,
        "bbox": region["bbox"],
        "processed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    features = [{"type": "Feature", "geometry": mapping(geom),
                 "properties": {**CLASSES[value], "area_km2": round(area, 2)}}
                for value, geom, area in vectors]
    collection_out = {"type": "FeatureCollection", "metadata": metadata, "monthly": monthly_rows,
                      "features": features}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{region['id']}_recorrencia.geojson"
    out.write_text(json.dumps(collection_out, ensure_ascii=False), encoding="utf-8")

    for f in features:
        log(f"  {f['properties']['class']:<11} {f['properties']['area_km2']:>8.2f} km²")
    top = sorted(monthly_rows, key=lambda r: -r["flooded_km2"])[:5]
    log("Meses com mais área alagada: " + ", ".join(f"{r['month']} ({r['flooded_km2']} km²)" for r in top))
    log(f"Salvo em {out.relative_to(BACKEND)} ({out.stat().st_size / 1e3:.0f} KB) "
        f"em {(time.monotonic() - started) / 60:.1f} min")


if __name__ == "__main__":
    main()
