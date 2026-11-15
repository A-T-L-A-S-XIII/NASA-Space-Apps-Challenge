"""Gera uma mancha d'água REAL a partir de uma cena NISAR GCOV.

Passos: busca a cena GCOV mais recente que cobre o bbox da região (asf_search),
abre o HDF5 por streaming com login Earthdata (earthaccess), lê só o recorte do
bbox, converte HH (ou VV) para dB, aplica um limiar (fixo ou Otsu), vetoriza a
máscara e salva em app/data/nisar/{region_id}_{AAAA-MM-DD}.geojson.

Uso (dentro de backend/, com EARTHDATA_USERNAME e EARTHDATA_PASSWORD no .env):
    pip install -r scripts/requirements-nisar.txt
    python scripts/process_nisar.py --estimate          # só mostra quanto vai baixar
    python scripts/process_nisar.py                     # processa a cena mais recente
    python scripts/process_nisar.py --method otsu
    python scripts/process_nisar.py --granule NISAR_L2_PR_GCOV_..._001

O processamento é feito aqui, fora da API (decisão D-D). A API só lê os GeoJSON.
"""

import argparse
import json
import math
import os
import sys
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import box, mapping, shape

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.data.regions import REGIONS, bbox_to_wkt  # noqa: E402

OUT_DIR = BACKEND / "app" / "data" / "nisar"
GRID = "/science/LSAR/GCOV/grids/frequencyA"

# Usada só se não houver cena sobre a região pedida (o script avisa)
GUAIBA = {"id": "guaiba-porto-alegre", "name": "Guaíba / Porto Alegre", "bbox": [-51.35, -30.25, -51.00, -29.90]}


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


# ----------------------------------------------------------------- busca

def coverage(scene_geometry: dict, bbox: list[float]) -> float:
    """Fração do bbox coberta pela cena (0 a 1)."""
    area = box(*bbox)
    return shape(scene_geometry).intersection(area).area / area.area


def find_scene(region: dict, granule: str | None, min_coverage: float):
    import asf_search as asf

    if granule:
        results = asf.granule_search([granule])
        results = [r for r in results if r.properties.get("processingLevel") == "GCOV"]
    else:
        results = asf.search(dataset="NISAR", processingLevel="GCOV",
                             intersectsWith=bbox_to_wkt(region["bbox"]), maxResults=100)
    results = sorted(results, key=lambda r: r.properties["startTime"], reverse=True)
    for result in results:
        cov = coverage(result.geometry, region["bbox"])
        if granule or cov >= min_coverage:
            return result, cov
    return None, 0.0


def h5_size_mb(result) -> float | None:
    sizes = result.properties.get("bytes")
    name = result.properties.get("fileName")
    if isinstance(sizes, dict) and name in sizes:
        return sizes[name]["bytes"] / 1e6
    return None


# ----------------------------------------------------------- leitura HDF5

def open_remote(url: str):
    """Arquivo remoto por streaming (só os pedaços lidos são baixados)."""
    import earthaccess

    if not (os.environ.get("EARTHDATA_USERNAME") and os.environ.get("EARTHDATA_PASSWORD")):
        sys.exit("Faltam EARTHDATA_USERNAME e EARTHDATA_PASSWORD no backend/.env")
    auth = earthaccess.login(strategy="environment")
    if not auth or not auth.authenticated:
        sys.exit("Login no Earthdata falhou: confira usuário e senha no .env")
    fs = earthaccess.get_fsspec_https_session()
    return fs.open(url, mode="rb", block_size=4 * 1024 * 1024, cache_type="blockcache")


def epsg_of(grid) -> int:
    proj = grid["projection"]
    for key in ("epsg_code", "epsg"):
        if key in proj.attrs:
            return int(np.asarray(proj.attrs[key]).ravel()[0])
    return int(np.asarray(proj[()]).ravel()[0])


def crop_window(grid, bbox: list[float]):
    """Linhas e colunas do grid que cobrem o bbox (o grid está em UTM)."""
    to_grid = Transformer.from_crs(4326, epsg_of(grid), always_xy=True)
    lon_min, lat_min, lon_max, lat_max = bbox
    # Densifica as bordas: em UTM o bbox em graus vira um quadrilátero torto
    lons = np.concatenate([np.linspace(lon_min, lon_max, 50)] * 2 + [np.full(50, lon_min), np.full(50, lon_max)])
    lats = np.concatenate([np.full(50, lat_min), np.full(50, lat_max)] + [np.linspace(lat_min, lat_max, 50)] * 2)
    xs, ys = to_grid.transform(lons, lats)

    x = grid["xCoordinates"][()]
    y = grid["yCoordinates"][()]
    cols = np.nonzero((x >= xs.min()) & (x <= xs.max()))[0]
    rows = np.nonzero((y >= ys.min()) & (y <= ys.max()))[0]
    if cols.size == 0 or rows.size == 0:
        return None
    return slice(rows[0], rows[-1] + 1), slice(cols[0], cols[-1] + 1), x, y


def bytes_to_read(ds, rows: slice, cols: slice) -> int:
    """Soma o tamanho (comprimido) dos chunks do HDF5 que cruzam o recorte."""
    if ds.chunks is None:
        return (rows.stop - rows.start) * (cols.stop - cols.start) * ds.dtype.itemsize
    ch_r, ch_c = ds.chunks
    total = 0
    for r in range(rows.start // ch_r * ch_r, rows.stop, ch_r):
        for c in range(cols.start // ch_c * ch_c, cols.stop, ch_c):
            info = ds.id.get_chunk_info_by_coord((r, c))
            total += info.size if info is not None and info.size else ch_r * ch_c * ds.dtype.itemsize
    return total


def read_downsampled(ds, rows: slice, cols: slice, x: np.ndarray, y: np.ndarray, factor: int):
    """Lê o recorte em faixas (pouca memória) e tira a média de blocos factor x factor.

    A média em potência linear é um multilook: reduz o ruído do radar e o tamanho do array
    (factor=2 transforma 10 m em 20 m e usa 4x menos memória). Pixels sem medição viram NaN.
    """
    start = rows.start - rows.start % factor  # faixas alinhadas com os chunks do HDF5
    height = (rows.stop - start) // factor * factor
    width = (cols.stop - cols.start) // factor * factor
    out = np.empty((height // factor, width // factor), dtype=np.float32)
    step = ds.chunks[0] if ds.chunks else 512
    bounds = sorted({start, start + height} | set(range((start // step + 1) * step, start + height, step)))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # blocos inteiros sem medição
        for r0, r1 in zip(bounds, bounds[1:]):
            block = ds[r0:r1, cols.start:cols.start + width].astype(np.float32)
            block[~(np.isfinite(block) & (block > 0))] = np.nan
            blocks = block.reshape((r1 - r0) // factor, factor, width // factor, factor)
            out[(r0 - start) // factor:(r1 - start) // factor] = np.nanmean(blocks, axis=(1, 3))
    xs = x[cols.start:cols.start + width].reshape(-1, factor).mean(axis=1)
    ys = y[start:start + height].reshape(-1, factor).mean(axis=1)
    return out, xs, ys


def pick_polarization(grid, wanted: str) -> str:
    for pol in [wanted, "HH", "VV"]:
        if f"{pol}{pol}" in grid:
            return pol
    sys.exit(f"A cena não tem HH nem VV em {GRID} (tem: {list(grid)})")


# --------------------------------------------------------- detecção de água

def otsu(db: np.ndarray) -> float:
    """Limiar de Otsu sobre o histograma em dB (entre -35 e +5 dB)."""
    values = db[np.isfinite(db)]
    hist, edges = np.histogram(np.clip(values, -35, 5), bins=256, range=(-35, 5))
    centers = (edges[:-1] + edges[1:]) / 2
    weight = np.cumsum(hist)
    mean = np.cumsum(hist * centers)
    total, total_mean = weight[-1], mean[-1]
    w0, w1 = weight[:-1], total - weight[:-1]
    valid = (w0 > 0) & (w1 > 0)
    between = np.zeros_like(w0, dtype=float)
    m0 = mean[:-1][valid] / w0[valid]
    m1 = (total_mean - mean[:-1][valid]) / w1[valid]
    between[valid] = w0[valid] * w1[valid] * (m0 - m1) ** 2
    return float(centers[np.argmax(between)])


def majority_3x3(mask: np.ndarray) -> np.ndarray:
    """Limpa o sal-e-pimenta do radar: o pixel fica água se 5 dos 9 vizinhos forem água."""
    padded = np.pad(mask.astype(np.uint8), 1)
    h, w = mask.shape
    votes = sum(padded[i:i + h, j:j + w] for i in range(3) for j in range(3))
    return votes >= 5


def vectorize(mask: np.ndarray, x: np.ndarray, y: np.ndarray, min_area_m2: float):
    """Máscara -> (MultiPolygon em UTM sem manchas pequenas, tamanho do pixel em m)."""
    from affine import Affine
    from rasterio import features

    dx, dy = float(x[1] - x[0]), float(y[1] - y[0])  # dy é negativo (norte para cima)
    transform = Affine(dx, 0, float(x[0]) - dx / 2, 0, dy, float(y[0]) - dy / 2)
    # Remove as manchas pequenas ainda no raster: vetorizar milhões de pixels soltos estoura a memória
    min_pixels = max(1, int(min_area_m2 / (dx * dx)))
    mask = features.sieve(mask.astype(np.uint8), size=min_pixels, connectivity=8).astype(bool)
    polygons = [shape(geom) for geom, value in features.shapes(mask.astype(np.uint8), mask=mask,
                                                                transform=transform) if value == 1]
    polygons = [p for p in polygons if p.area >= min_area_m2]
    if not polygons:
        return None, abs(dx)
    return shapely.union_all(polygons), abs(dx)


# ------------------------------------------------------------------- main

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--region", default="vale-do-taquari", choices=sorted(REGIONS))
    parser.add_argument("--granule", help="Processa esta cena em vez da mais recente")
    parser.add_argument("--pol", default="HH", choices=["HH", "VV"], help="Polarização (padrão: HH)")
    parser.add_argument("--method", default="fixed", choices=["fixed", "otsu"],
                        help="fixed: usa --threshold; otsu: calcula o limiar pela cena")
    parser.add_argument("--threshold", type=float, default=-18.0, help="Limiar em dB para água (padrão: -18)")
    parser.add_argument("--min-coverage", type=float, default=0.5, help="Fração mínima do bbox coberta pela cena")
    parser.add_argument("--min-area-m2", type=float, default=10_000, help="Descarta manchas menores (padrão: 1 ha)")
    parser.add_argument("--max-mb", type=float, default=800, help="Para se o recorte passar disto (padrão: 800 MB)")
    parser.add_argument("--downsample", type=int, default=2,
                        help="Média de blocos NxN antes do limiar (padrão: 2, 10 m -> 20 m; 1 = resolução nativa)")
    parser.add_argument("--estimate", action="store_true", help="Só mostra cena e tamanho do download, sem baixar")
    args = parser.parse_args()
    load_env()
    started = time.monotonic()

    region = REGIONS[args.region]
    result, cov = find_scene(region, args.granule, args.min_coverage)
    if result is None:
        log(f"AVISO: nenhuma cena GCOV cobre {region['name']}. Usando {GUAIBA['name']}.")
        region = GUAIBA
        result, cov = find_scene(region, None, args.min_coverage)
        if result is None:
            sys.exit("Nenhuma cena GCOV encontrada nem para o Guaíba.")

    props = result.properties
    granule = props["sceneName"] if props.get("sceneName") else props["fileID"]
    url = props["url"]
    log(f"Cena: {granule}")
    log(f"Data: {props['startTime']}  |  cobre {cov:.0%} do bbox de {region['name']}")
    full = h5_size_mb(result)
    log(f"Arquivo inteiro: {full:,.0f} MB (não será baixado)" if full else "Tamanho do arquivo: desconhecido")

    import h5py

    remote = open_remote(url)
    with h5py.File(remote, "r") as h5:
        grid = h5[GRID]
        pol = pick_polarization(grid, args.pol)
        window = crop_window(grid, region["bbox"])
        if window is None:
            sys.exit("O grid da cena não cruza o bbox da região.")
        rows, cols, x_all, y_all = window
        ds = grid[f"{pol}{pol}"]
        need_mb = bytes_to_read(ds, rows, cols) / 1e6
        shape_txt = f"{rows.stop - rows.start} x {cols.stop - cols.start} pixels"
        log(f"Recorte: {shape_txt}, {pol}{pol}, EPSG:{epsg_of(grid)} -> cerca de {need_mb:,.0f} MB por streaming")
        if args.estimate:
            return
        if need_mb > args.max_mb:
            sys.exit(f"O recorte passa de {args.max_mb:.0f} MB. Rode com --max-mb maior se quiser mesmo baixar.")

        log("Lendo o recorte...")
        power, x, y = read_downsampled(ds, rows, cols, x_all, y_all, max(1, args.downsample))
        epsg = epsg_of(grid)
    log(f"Leitura em {time.monotonic() - started:.0f} s")

    valid = np.isfinite(power)
    db = power  # converte no lugar, sem outra cópia do array
    np.log10(db, out=db, where=valid)
    db *= 10
    threshold = otsu(db) if args.method == "otsu" else args.threshold
    water = majority_3x3(valid & (db < threshold)) & valid
    log(f"Limiar: {threshold:.1f} dB ({args.method})  |  pixels válidos: {valid.mean():.0%}")

    geom_utm, pixel_m = vectorize(water, x, y, args.min_area_m2)
    if geom_utm is None:
        sys.exit("Nenhuma água detectada com esse limiar. Tente --method otsu ou outro --threshold.")
    geom_utm = geom_utm.simplify(pixel_m, preserve_topology=True)

    to_lonlat = Transformer.from_crs(epsg, 4326, always_xy=True)
    geom = shapely.transform(geom_utm, to_lonlat.transform, interleaved=False)
    geom = shapely.set_precision(geom, 1e-5).intersection(box(*region["bbox"]))
    # O recorte pelo bbox pode deixar linhas soltas na borda; fica só o que é polígono
    parts = [g for g in getattr(geom, "geoms", [geom]) if g.geom_type in ("Polygon", "MultiPolygon")]
    geom = shapely.union_all(parts)
    # Área depois do recorte pelo bbox, em UTM (a mesma conta que a API faz)
    to_utm = Transformer.from_crs(4326, epsg, always_xy=True)
    area_km2 = shapely.transform(geom, to_utm.transform, interleaved=False).area / 1e6

    date = props["startTime"][:10]
    metadata = {
        "source": "nisar",
        "region_id": region["id"],
        "granule": granule,
        "date": date,
        "acquisition_time": props["startTime"],
        "track": "_".join(granule.split("_")[5:8]) if granule.count("_") > 8 else None,
        "flight_direction": props.get("flightDirection"),
        "polarization": pol,
        "method": args.method,
        "threshold_db": round(threshold, 2),
        "water_area_km2": round(area_km2, 2),
        "valid_fraction": round(float(valid.mean()), 3),
        "scene_coverage": round(cov, 3),
        "pixel_size_m": round(pixel_m, 1),
        "min_area_m2": args.min_area_m2,
        "bbox": region["bbox"],
        "url": url,
        "processed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    collection = {"type": "FeatureCollection", "metadata": metadata,
                  "features": [{"type": "Feature", "geometry": mapping(geom), "properties": metadata}]}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{region['id']}_{date}.geojson"
    out.write_text(json.dumps(collection, ensure_ascii=False), encoding="utf-8")

    minutes = (time.monotonic() - started) / 60
    log(f"Água: {area_km2:.2f} km²  |  salvo em {out.relative_to(BACKEND)} ({out.stat().st_size / 1e3:.0f} KB)")
    log(f"Tempo total: {math.ceil(minutes)} min")
    if region is GUAIBA:
        log("AVISO: a mancha é do Guaíba/Porto Alegre, não do Vale do Taquari.")


if __name__ == "__main__":
    main()
