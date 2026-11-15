"""Salva as respostas do ASF e da NOAA em app/data/snapshots/ para o modo offline.

Uso (dentro de backend/):
    python scripts/snapshot.py
    python scripts/snapshot.py --products GCOV GUNW

Rode de novo antes do pitch para deixar os snapshots atualizados.
"""

import argparse
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
from app.data.regions import REGIONS, bbox_to_wkt  # noqa: E402
from app.services import asf, enso, snapshots  # noqa: E402

# Teto do ASF por busca; o Vale do Taquari tem bem menos cenas que isso
MAX_SCENES = 2000


def snapshot_asf(client: httpx.Client, products: list[str]) -> None:
    searches = []
    for region in REGIONS.values():
        wkt = bbox_to_wkt(region["bbox"])
        for product in products:
            params = asf.search_params(wkt, product=product, limit=MAX_SCENES)
            response = client.get(settings.asf_search_url, params=params, timeout=settings.asf_timeout_seconds)
            response.raise_for_status()
            features = response.json().get("features") or []
            searches.append({"region_id": region["id"], "wkt": wkt, "product": product, "features": features})
            print(f"ASF  {region['id']} {product}: {len(features)} cenas")
    path = snapshots.save(snapshots.ASF_FILE, {"url": settings.asf_search_url, "searches": searches})
    print(f"     salvo em {path}")


def snapshot_noaa(client: httpx.Client) -> None:
    response = client.get(settings.noaa_oni_url, timeout=settings.enso_timeout_seconds)
    response.raise_for_status()
    series = enso.parse_oni(response.text)
    if not series:
        raise ValueError("arquivo da NOAA sem linhas no formato SEAS YR TOTAL ANOM")
    path = snapshots.save(snapshots.NOAA_FILE, {"url": settings.noaa_oni_url, "text": response.text})
    print(f"NOAA ONI: {len(series)} estações, a última é {series[-1]['season']} {series[-1]['year']}")
    print(f"     salvo em {path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--products", nargs="+", default=["GCOV"], help="Produtos NISAR (padrão: GCOV)")
    args = parser.parse_args()

    failed = False
    with httpx.Client(follow_redirects=True) as client:
        for name, step in [("ASF", lambda: snapshot_asf(client, [p.upper() for p in args.products])),
                           ("NOAA", lambda: snapshot_noaa(client))]:
            try:
                step()
            except (httpx.HTTPError, ValueError) as exc:
                # Um snapshot antigo continua valendo se a fonte falhar agora
                print(f"{name}: falhou ({exc}); o snapshot anterior, se houver, foi mantido", file=sys.stderr)
                failed = True
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
