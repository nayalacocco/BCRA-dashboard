"""
Pipeline de inflación — F1.

Uso:
  python -m inflacion.run --out ../data/inflacion            # descarga, valida, exporta
  python -m inflacion.run --out ../data/inflacion --check    # no escribe; sale con código 1 si falla un check bloqueante

Salidas (JSON, versionadas en git):
  manifest.json        versión, fuentes (URL, sha256, último período), resultado de checks
  items.json           metadatos de cada ítem (región, código, división, residual, ponderadores)
  panel_indices.json   índices por ítem (base dic-2016 = 100), una fila por mes
  headline.json        publicados por INDEC (Nacional): nivel general, núcleo, regulados, estacional, bienes, servicios
  reconciliacion.json  m/m publicado vs. recomputado, por Nacional y región
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

from . import indec
from .items import IMPUTADOS, build_panel
from .validate import check_divisiones_cubiertas, check_fechas, check_outliers, check_ponderadores, reconciliacion, to_dict

UA = {"User-Agent": "Mozilla/5.0 (Atlas WM bcra-dashboard pipeline; +https://github.com/nayalacocco/BCRA-dashboard)"}
SCHEMA_VERSION = 1


def fetch(url: str) -> bytes:
    last = None
    for _ in range(3):
        try:
            r = requests.get(url, headers=UA, timeout=90)
            r.raise_for_status()
            return r.content
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"No se pudo descargar {url}: {last}")


def _round(x, n=4):
    return None if pd.isna(x) else round(float(x), n)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)

    raw = {
        "divisiones": fetch(indec.URL_DIVISIONES),
        "aperturas": fetch(indec.URL_APERTURAS),
        "ponderadores": fetch(indec.URL_PONDERADORES),
    }
    urls = {"divisiones": indec.URL_DIVISIONES, "aperturas": indec.URL_APERTURAS, "ponderadores": indec.URL_PONDERADORES}

    div = indec.parse_csv(raw["divisiones"])
    ape = indec.parse_csv(raw["aperturas"])
    pond = indec.parse_ponderadores(raw["ponderadores"])

    items, panel, warns = build_panel(div, ape, pond)

    checks = [check_ponderadores(pond), check_fechas(div, ape, panel)]
    rec_check, rec = reconciliacion(items, panel, div)
    checks += [rec_check, check_divisiones_cubiertas(items, panel, div), check_outliers(panel)]

    for c in checks:
        flag = "OK " if c.ok else ("FAIL" if c.bloqueante else "WARN")
        print(f"[{flag}] {c.nombre}: {c.detalle}")
    for w in warns:
        print(f"[WARN] {w}")

    # Diagnóstico de faltantes y meses fuera de tolerancia
    for k, v in IMPUTADOS.items():
        print(f"  imputado con variación de la división: {k} {v}")
    malos = rec[(rec.fecha >= "2017-01-01") & (rec.desvio_pp.abs() > 0.05)]
    for _, r in malos.iterrows():
        print(f"  fuera de tol: {r.scope} {r.fecha:%Y-%m} pub={r.publicado:.3f} rec={r.recomputado:.3f} d={r.desvio_pp:+.3f}")

    # Reporte de reconciliación por mes (Nacional), útil en los logs del PR
    nac = rec[rec.scope == "Nacional"].tail(24)
    print("\nReconciliación Nacional (últimos 24 meses): fecha | publicado | recomputado | desvío pp")
    for _, r in nac.iterrows():
        print(f"  {r.fecha:%Y-%m} | {r.publicado:6.3f} | {r.recomputado:6.3f} | {r.desvio_pp:+.4f}")

    from .sanity import reporte
    print("\nSanity check difusión (comparable con Banco Galicia):")
    print(reporte(items, panel))

    bloqueante_fallo = any(not c.ok and c.bloqueante for c in checks)
    if args.check:
        return 1 if bloqueante_fallo else 0
    if bloqueante_fallo:
        print("\nHay checks bloqueantes en falla: no se escriben datos.", file=sys.stderr)
        return 1

    out.mkdir(parents=True, exist_ok=True)
    ultimo = panel.index.max()

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "generado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "ultimo_periodo": f"{ultimo:%Y-%m}",
        "n_items": len(items),
        "n_items_publicados": sum(not i.residual for i in items),
        "n_items_residuales": sum(i.residual for i in items),
        "fuentes": {
            k: {"url": urls[k], "sha256": hashlib.sha256(v).hexdigest(), "bytes": len(v)} for k, v in raw.items()
        },
        "pesos_region": indec.PESO_REGION,
        "checks": [to_dict(c) for c in checks],
        "advertencias": warns,
        "imputados": IMPUTADOS,
        "metodologia": {
            "items": "Hojas de serie_ipc_aperturas.csv por región + un ítem 'Resto de división' por división×región derivado con ponderadores de base.",
            "peso_nacional": "W_region × w_item|region (ponderadores_ipc.xls, dic-2016).",
            "peso_efectivo": "ω_i,t = ω_i·I_i,t−1 / Σ ω_j·I_j,t−1 (índice de base fija).",
        },
    }

    (out / "items.json").write_text(json.dumps([i.__dict__ for i in items], ensure_ascii=False, indent=1))
    (out / "panel_indices.json").write_text(json.dumps({
        "fechas": [f"{f:%Y-%m}" for f in panel.index],
        "items": {c: [_round(v) for v in panel[c].values] for c in panel.columns},
    }, ensure_ascii=False))

    nac_div = div[div.region == "Nacional"]
    def serie(clasif: str, codigo: str):
        s = nac_div[(nac_div.clasificador == clasif) & (nac_div.codigo == codigo)].set_index("fecha").sort_index()
        return {"indice": [_round(v) for v in s.indice], "vm": [_round(v, 2) for v in s.vm], "via": [_round(v, 2) for v in s.via]}
    fechas_nac = sorted(nac_div.fecha.unique())
    (out / "headline.json").write_text(json.dumps({
        "fechas": [f"{pd.Timestamp(f):%Y-%m}" for f in fechas_nac],
        "nivel_general": serie("Nivel general y divisiones COICOP", "0"),
        "nucleo": serie("Categorias", "Núcleo"),
        "regulados": serie("Categorias", "Regulados"),
        "estacional": serie("Categorias", "Estacional"),
        "bienes": serie("Bienes y servicios", "B"),
        "servicios": serie("Bienes y servicios", "S"),
    }, ensure_ascii=False))
    (out / "reconciliacion.json").write_text(json.dumps([
        {"fecha": f"{r.fecha:%Y-%m}", "scope": r.scope, "publicado": _round(r.publicado), "recomputado": _round(r.recomputado), "desvio_pp": _round(r.desvio_pp)}
        for _, r in rec.iterrows()
    ], ensure_ascii=False))
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    print(f"\nEscrito en {out} — último período {ultimo:%Y-%m}, {len(items)} ítems")
    return 0


if __name__ == "__main__":
    sys.exit(main())
