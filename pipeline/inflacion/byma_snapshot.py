"""
Foto diaria de precios de bonos en pesos (LECAP, BONCAP, Boncer, letras CER) desde la API pública de ByMA.

Por qué: la API gratuita no tiene histórico. Guardar una foto por día hábil construye la historia
necesaria para la curva de breakeven (M4/F5).

La API pagina (≈189 registros por página): se recorren todas las páginas de "public-bonds" y "lebacs".

Uso: python -m inflacion.byma_snapshot --out ../data/bonos
Salida: data/bonos/AAAA/AAAA-MM-DD.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

BASE = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/"
HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122 Safari/537.36",
    "Origin": "https://open.bymadata.com.ar",
    "Referer": "https://open.bymadata.com.ar/",
}
# Pesos: LECAP (S..), BONCAP (T..), Boncer (TZX.., TX.., DICP, PARP, CUAP), letras CER (X..), duales (TTx..)
PATRON = re.compile(r"^(S\d{2}[A-Z]\d|T\d{2}[A-Z]\d|TZX[A-Z0-9]{2,3}|TZV\w+|TX\d{2}|X\d{2}[A-Z]\d|DICP|PARP|CUAP|TT[A-Z]\d{2})$")
CAMPOS = [
    "symbol", "settlementType", "denominationCcy", "maturityDate", "daysToMaturity",
    "securityType", "securitySubType", "closingPrice", "previousClosingPrice", "settlementPrice",
    "trade", "vwap", "bidPrice", "offerPrice", "volume", "volumeAmount", "tradeHour",
]


def post_all(endpoint: str, verify) -> list[dict]:
    rows: list[dict] = []
    page = 1
    while True:
        body = {"excludeZeroPxAndQty": False, "T2": True, "T1": True, "T0": True, "page_number": page}
        r = requests.post(BASE + endpoint, headers=HEADERS, json=body, timeout=60, verify=verify)
        r.raise_for_status()
        j = r.json()
        data = j.get("data", []) if isinstance(j, dict) else j
        rows.extend(data)
        count = (j.get("content") or {}).get("page_count", 1) if isinstance(j, dict) else 1
        if page >= count or not data:
            break
        page += 1
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    verify: bool | str = True
    try:
        requests.get(BASE.rsplit("/vanoms", 1)[0], timeout=20)
    except requests.exceptions.SSLError:
        # ByMA sirve una cadena incompleta (falta el intermedio). Se acepta solo para este host, solo lectura.
        warnings.warn("ByMA: cadena TLS incompleta, se desactiva la verificación para este host")
        verify = False

    filas = []
    for ep in ("public-bonds", "lebacs"):
        for x in post_all(ep, verify):
            if x.get("denominationCcy") == "ARS" and PATRON.match(x.get("symbol", "")):
                filas.append({k: x.get(k) for k in CAMPOS} | {"panel": ep})

    hoy = datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).date()
    out = Path(args.out) / f"{hoy:%Y}"
    out.mkdir(parents=True, exist_ok=True)
    payload = {
        "fecha": f"{hoy:%Y-%m-%d}",
        "capturado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "fuente": "ByMA open data (free, puede tener demora)",
        "n": len(filas),
        "especies": sorted({f["symbol"] for f in filas}),
        "cotizaciones": filas,
    }
    (out / f"{hoy:%Y-%m-%d}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1))
    print(f"{len(filas)} cotizaciones, {len(payload['especies'])} especies: {' '.join(payload['especies'])}")
    return 0 if filas else 1


if __name__ == "__main__":
    sys.exit(main())
