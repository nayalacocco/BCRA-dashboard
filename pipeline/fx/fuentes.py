"""
Descarga de fuentes para la pestaña Tipo de cambio (sección 1 + reservas).

Todas las fuentes son públicas, sin credenciales:

  BCRA API v4 (estadisticas/v4.0/monetarias/{id})   — series diarias
      1244  Reservas internacionales (USD M)
      1243  Cuenta corriente en moneda extranjera en el BCRA = encajes en USD (USD M)
      1266  Depósitos del Gobierno en el BCRA en moneda extranjera (millones de $)
         5  Tipo de cambio mayorista, Com. A 3500
        78  Factores de variación de reservas: compra de divisas (USD M)
      1187  Régimen de bandas cambiarias — límite inferior ($/USD)
      1188  Régimen de bandas cambiarias — límite superior ($/USD)
       158  LEBAC en ME, LEDIV y BOPREAL — stock (USD M)
  BCRA API cambiaria (estadisticascambiarias/v1.0/Cotizaciones/XDR) — USD por DEG
  BCRA planilla de Reservas Internacionales y Liquidez en ME (NEDD/FMI), mensual:
      https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/tempMMYY.pdf
  FMI — Transactions with the Fund (Argentina), acumulado anual a una fecha de corte.
  argentinadatos.com — cotizaciones diarias (oficial, MEP, CCL, blue, cripto).
"""

from __future__ import annotations

import datetime as dt
import json
import time
import warnings
from pathlib import Path

import requests

UA = {"User-Agent": "Mozilla/5.0 (bcra-dashboard pipeline; +https://github.com/nayalacocco/bcra-dashboard)"}
TIMEOUT = 60

BCRA_V4 = "https://api.bcra.gob.ar/estadisticas/v4.0/monetarias"
BCRA_CAMB = "https://api.bcra.gob.ar/estadisticascambiarias/v1.0"
IRFCL_URL = "https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/temp{mm:02d}{yy:02d}.pdf"
IMF_TRANS = (
    "https://www.imf.org/external/np/fin/tad/extrans1.aspx"
    "?memberKey1=30&endDate={fecha}&finposition_flag=YES"
)
ARGDATOS = "https://api.argentinadatos.com/v1/cotizaciones/dolares/{tipo}"

SERIES_BCRA = {
    "reservas": 1244,
    "encajes_usd": 1243,
    "dep_tesoro_ars": 1266,
    "a3500": 5,
    "compras_bcra": 78,
    "banda_inf": 1187,
    "banda_sup": 1188,
    "bopreal_stock": 158,
}
TIPOS_ARGDATOS = {
    "oficial": "oficial",
    "mayorista": "mayorista",
    "mep": "bolsa",
    "ccl": "contadoconliqui",
    "blue": "blue",
    "cripto": "cripto",
}


def _get(url: str, *, params: dict | None = None, intentos: int = 3) -> requests.Response:
    """GET con reintentos. Los dominios del BCRA a veces sirven la cadena TLS incompleta:
    si falla la verificación, se reintenta sin verificar (solo *.bcra.gob.ar, datos públicos)."""
    ultimo: Exception | None = None
    for i in range(intentos):
        try:
            return _get_once(url, params=params, verify=True)
        except requests.exceptions.SSLError as e:
            if "bcra.gob.ar" not in url:
                raise
            warnings.warn(f"TLS incompleto en {url}; reintento sin verificar ({e.__class__.__name__})")
            try:
                return _get_once(url, params=params, verify=False)
            except Exception as e2:  # noqa: BLE001
                ultimo = e2
        except Exception as e:  # noqa: BLE001
            ultimo = e
        time.sleep(2 * (i + 1))
    raise RuntimeError(f"No se pudo descargar {url}: {ultimo}")


def _get_once(url: str, *, params: dict | None, verify: bool) -> requests.Response:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        r = requests.get(url, params=params, headers=UA, timeout=TIMEOUT, verify=verify)
    if r.status_code == 404:
        r.raise_for_status()
    r.raise_for_status()
    return r


# ── BCRA API v4 ───────────────────────────────────────────────────────────────


def serie_bcra(id_variable: int, desde: str = "2003-01-01", hasta: str | None = None) -> list[dict]:
    """Serie completa [{fecha, valor}] ordenada ascendente. Pagina de a 3000 registros."""
    hasta = hasta or dt.date.today().isoformat()
    out: list[dict] = []
    offset = 0
    while True:
        r = _get(
            f"{BCRA_V4}/{id_variable}",
            params={"desde": desde, "hasta": hasta, "limit": 3000, "offset": offset},
        )
        js = r.json()
        res = js.get("results") or []
        detalle = res[0].get("detalle", []) if res else []
        out.extend({"fecha": d["fecha"], "valor": d["valor"]} for d in detalle)
        total = (js.get("metadata") or {}).get("resultset", {}).get("count", 0)
        offset += 3000
        if not detalle or offset >= total:
            break
    out.sort(key=lambda d: d["fecha"])
    # dedup por fecha (la API repite registros en bordes de página)
    dedup: dict[str, float] = {d["fecha"]: d["valor"] for d in out}
    return [{"fecha": f, "valor": v} for f, v in sorted(dedup.items())]


def xdr_usd(desde: str, hasta: str) -> list[dict]:
    """USD por DEG (tipoPase de la cotización XDR del BCRA), por tramos de 1 año."""
    out: dict[str, float] = {}
    d0 = dt.date.fromisoformat(desde)
    d1 = dt.date.fromisoformat(hasta)
    while d0 <= d1:
        fin = min(d0 + dt.timedelta(days=364), d1)
        r = _get(
            f"{BCRA_CAMB}/Cotizaciones/XDR",
            params={"fechadesde": d0.isoformat(), "fechahasta": fin.isoformat(), "limit": 1000},
        )
        for row in r.json().get("results") or []:
            for det in row.get("detalle") or []:
                if det.get("codigoMoneda") == "XDR" and det.get("tipoPase"):
                    out[row["fecha"]] = float(det["tipoPase"])
        d0 = fin + dt.timedelta(days=1)
    return [{"fecha": f, "valor": v} for f, v in sorted(out.items())]


# ── Planilla IRFCL (PDF mensual) ─────────────────────────────────────────────


def irfcl_pdf(anio: int, mes: int) -> bytes | None:
    """Planilla del mes (dato a fin de mes). None si el BCRA no la publica (404)."""
    url = IRFCL_URL.format(mm=mes, yy=anio % 100)
    try:
        r = _get(url, intentos=2)
    except Exception as e:  # noqa: BLE001
        if "404" in str(e):
            return None
        raise
    if not r.content.startswith(b"%PDF"):
        return None
    return r.content


# ── FMI: transacciones con el Fondo ──────────────────────────────────────────


def imf_transacciones(fecha_corte: str) -> dict[int, dict]:
    """Tabla anual (en DEG) acumulada hasta fecha_corte: {anio: {compras, recompras, cargos}}.
    Fuente: Transactions with the Fund, Argentina (GRA)."""
    r = _get(IMF_TRANS.format(fecha=fecha_corte))
    return parse_imf_transacciones(r.text)


def parse_imf_transacciones(html: str) -> dict[int, dict]:
    import re

    out: dict[int, dict] = {}
    # Filas: <td>2026</td><td>763,000,000</td><td>583,333,333</td><td>1,714,750,361</td>...
    filas = re.findall(r"<tr[^>]*>(.*?)</tr>", html, flags=re.S | re.I)
    for f in filas:
        celdas = [re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", f, flags=re.S | re.I)]
        if len(celdas) < 4 or not re.fullmatch(r"(19|20)\d\d", celdas[0]):
            continue

        def n(s: str) -> float:
            s = s.replace(",", "").strip()
            return float(s) if s and s not in {"-", "--"} else 0.0

        out[int(celdas[0])] = {"compras": n(celdas[1]), "recompras": n(celdas[2]), "cargos": n(celdas[3])}
    return out


# ── argentinadatos ───────────────────────────────────────────────────────────


def cotizaciones(tipo: str) -> list[dict]:
    r = _get(ARGDATOS.format(tipo=TIPOS_ARGDATOS[tipo]))
    out = []
    for d in r.json():
        out.append({"fecha": d["fecha"][:10], "compra": d.get("compra"), "venta": d.get("venta")})
    out.sort(key=lambda d: d["fecha"])
    return out


# ── Volcado crudo (para desarrollo y tests) ──────────────────────────────────


def volcar_crudo(dest: Path, desde_irfcl: int = 2016) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    log: dict = {"generado": dt.datetime.now(dt.UTC).replace(tzinfo=None).isoformat() + "Z", "irfcl": {}, "errores": {}}
    for nombre, idv in SERIES_BCRA.items():
        try:
            (dest / f"bcra_{nombre}.json").write_text(json.dumps(serie_bcra(idv)))
        except Exception as e:  # noqa: BLE001
            log["errores"][nombre] = str(e)
    try:
        (dest / "xdr.json").write_text(json.dumps(xdr_usd("2016-01-01", dt.date.today().isoformat())))
    except Exception as e:  # noqa: BLE001
        log["errores"]["xdr"] = str(e)
    for tipo in TIPOS_ARGDATOS:
        try:
            (dest / f"argdatos_{tipo}.json").write_text(json.dumps(cotizaciones(tipo)))
        except Exception as e:  # noqa: BLE001
            log["errores"][f"argdatos_{tipo}"] = str(e)
    hoy = dt.date.today()
    (dest / "irfcl").mkdir(exist_ok=True)
    for anio in range(desde_irfcl, hoy.year + 1):
        for mes in range(1, 13):
            if (anio, mes) >= (hoy.year, hoy.month):
                break
            try:
                pdf = irfcl_pdf(anio, mes)
            except Exception as e:  # noqa: BLE001
                log["irfcl"][f"{anio}-{mes:02d}"] = f"error: {e}"
                continue
            if pdf is None:
                log["irfcl"][f"{anio}-{mes:02d}"] = "404"
                continue
            (dest / "irfcl" / f"{anio}-{mes:02d}.pdf").write_bytes(pdf)
            log["irfcl"][f"{anio}-{mes:02d}"] = len(pdf)
    try:
        for corte in ["2025-03-31", "2025-12-31", hoy.isoformat()]:
            r = _get(IMF_TRANS.format(fecha=corte))
            (dest / f"imf_trans_{corte}.html").write_text(r.text)
    except Exception as e:  # noqa: BLE001
        log["errores"]["imf"] = str(e)
    (dest / "log.json").write_text(json.dumps(log, indent=1))


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--desde", type=int, default=2016)
    a = ap.parse_args()
    volcar_crudo(Path(a.raw), a.desde)
