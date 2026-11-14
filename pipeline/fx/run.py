"""
Pipeline Tipo de cambio — sección 1 (dónde está y bajo qué reglas) + reservas netas.

Uso:
    python -m fx.run --out ../data/fx               # descarga en vivo (GitHub Actions)
    python -m fx.run --out ../data/fx --raw DIR     # usa un volcado crudo (desarrollo local)

Salidas (JSON):
    cotizaciones.json   A3500, MEP, CCL, blue, cripto y banda; distancias y ritmos
    compras.json        compras netas del BCRA en el MLC (diarias, acumuladas 30/90 días)
    reservas.json       perímetros A y B (diario desde 2024, mensual desde 2016), waterfalls,
                        calendario ≤ 12 m por deudor, componentes con fecha/fuente, validaciones
    manifest.json       fuentes, últimas fechas y estado de frescura
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
from pathlib import Path

from . import fuentes, irfcl
from .reservas import (
    ANCLAS_STAFF_FMI,
    INICIO_PROGRAMA_FMI,
    TOLERANCIA_RIN,
    Serie,
    componentes_planilla,
    lineas_waterfall,
    meses_hasta,
    perimetros,
    rin_fmi,
    ritmo_mensual,
    suma_waterfall,
)

DESDE_COTIZ = "2019-01-01"
DESDE_DIARIA_RESERVAS = "2024-01-02"  # primer dato diario de depósitos del Tesoro en ME (API 1266)
MAX_DIAS = {"diaria": 7, "mensual": 75, "diaria_rezagada": 12}
MAX_DIAS_COMPONENTES = 120  # antigüedad máxima de la planilla para combinarla con datos diarios

FUENTES_META = {
    "brutas": ("BCRA, API v4 · variable 1244", "diaria"),
    "encajes": ("BCRA, API v4 · variable 1243 (cuenta corriente en ME en el BCRA)", "diaria"),
    "dep_tesoro": ("BCRA, API v4 · variable 1266 ÷ A3500", "diaria"),
    "swaps": ("BCRA, planilla de Reservas Internacionales y Liquidez en ME (NEDD-FMI), II.2(a)", "mensual"),
    "pases": ("BCRA, planilla de Reservas Internacionales y Liquidez en ME (NEDD-FMI), II.3", "mensual"),
    "swaps_pases": ("BCRA, planilla NEDD-FMI, II.3 (hasta nov-2022 agrupa swap con China y pases)", "mensual"),
    "otros_bcra": ("BCRA, planilla NEDD-FMI, II.1 Autoridades Monetarias − encajes − dep. Tesoro", "mensual"),
    "otros_bcra_mas_tesoro": ("BCRA, planilla NEDD-FMI, II.1 Autoridades Monetarias − encajes", "mensual"),
    "deuda_tesoro_12m": ("BCRA, planilla NEDD-FMI, II.1 Gobierno Central (capital + intereses)", "mensual"),
}

CRITERIOS = {
    "brutas": "Activos de reserva oficiales (I.A).",
    "encajes": "Depósitos de entidades en ME en el BCRA. Suman a las brutas y son de los bancos.",
    "swaps": (
        "Posición corta a término de swaps de monedas: la línea completa con China (suma entera a las brutas) y cualquier "
        "otro swap efectivamente activado. Se resta por suma a las brutas, no por plazo: el acuerdo marco con China se "
        "renovó en ago-2026 por cinco años (hasta 2031), aunque la planilla informa cada operación a ≤ 12 meses."
    ),
    "pases": "Pases pasivos en ME con bancos, vencimientos ≤ 12 meses.",
    "swaps_pases": "Hasta nov-2022 la planilla informa el swap con China junto con los pases (II.3).",
    "otros_bcra": "BOPREAL, organismos, intereses y otras obligaciones en ME del BCRA con vencimiento ≤ 12 meses. La planilla no los separa entre sí.",
    "otros_bcra_mas_tesoro": "Igual que la línea anterior, incluidos los depósitos del Tesoro (sin dato diario de estos antes de 2024).",
    "dep_tesoro": "Depósitos en ME del Tesoro en el BCRA. Se restan solo en el perímetro BCRA.",
    "deuda_tesoro_12m": "Servicios de deuda en ME del Gobierno Central (FMI, organismos, bonos, repos) con vencimiento ≤ 12 meses.",
    "netas_a": "Reservas netas BCRA.",
    "super_a": "Reservas super netas BCRA.",
    "netas_b": "Reservas netas del sector público consolidado.",
}


# ── utilidades ───────────────────────────────────────────────────────────────


def r1(x):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(float(x), 1)


def r2(x):
    return None if x is None else round(float(x), 2)


def dias_entre(a: str, b: str) -> int:
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days


def menos_dias(f: str, n: int) -> str:
    return (dt.date.fromisoformat(f) - dt.timedelta(days=n)).isoformat()


# ── carga de insumos ─────────────────────────────────────────────────────────


class Insumos:
    def __init__(self, raw: Path | None):
        self.raw = raw

    def bcra(self, nombre: str) -> list[dict]:
        if self.raw:
            return json.loads((self.raw / f"bcra_{nombre}.json").read_text())
        return fuentes.serie_bcra(fuentes.SERIES_BCRA[nombre])

    def xdr(self) -> list[dict]:
        if self.raw:
            return json.loads((self.raw / "xdr.json").read_text())
        return fuentes.xdr_usd("2024-12-01", dt.date.today().isoformat())

    def cotiz(self, tipo: str) -> list[dict]:
        if self.raw:
            return json.loads((self.raw / f"argdatos_{tipo}.json").read_text())
        return fuentes.cotizaciones(tipo)

    def planillas(self) -> dict[str, irfcl.Planilla]:
        out: dict[str, irfcl.Planilla] = {}
        hoy = dt.date.today()
        if self.raw:
            for f in sorted((self.raw / "irfcl").glob("*.pdf")):
                p = irfcl.parse(f.read_bytes())
                out[p.fecha] = p
            return out
        for anio in range(2016, hoy.year + 1):
            for mes in range(1, 13):
                if (anio, mes) >= (hoy.year, hoy.month):
                    break
                pdf = fuentes.irfcl_pdf(anio, mes)
                if pdf is None:
                    continue
                p = irfcl.parse(pdf)
                out[p.fecha] = p
        return out

    def compras_fmi(self) -> list[dict]:
        """Escalones de compras netas acumuladas al FMI (millones de DEG) desde el inicio del programa.
        [{fecha, deg}] — fecha = primer día con el nuevo acumulado."""
        if self.raw:
            # modo desarrollo: solo hay cortes anuales; se ubica todo 2025 en la fecha de aprobación
            snap = fuentes.parse_imf_transacciones((self.raw / "imf_trans_2026-11-13.html").read_text())
            neto25 = (snap[2025]["compras"] - snap[2025]["recompras"]) / 1e6
            neto26 = snap.get(2026, {"compras": 0, "recompras": 0})
            return [
                {"fecha": INICIO_PROGRAMA_FMI, "deg": neto25, "aprox": True},
                {"fecha": "2026-06-01", "deg": neto25 + (neto26["compras"] - neto26["recompras"]) / 1e6, "aprox": True},
            ]
        return escalones_fmi()


def acumulado_fmi(fecha: str, cache: dict[str, float]) -> float:
    if fecha not in cache:
        tabla = fuentes.imf_transacciones(fecha)
        cache[fecha] = sum(v["compras"] - v["recompras"] for a, v in tabla.items() if a >= 2025) / 1e6  # DEG → millones de DEG
    return cache[fecha]


def escalones_fmi() -> list[dict]:
    """Compras netas acumuladas al FMI desde el inicio del programa, por fin de mes.
    'Transactions with the Fund' recorta la fecha de corte al último fin de mes cerrado: la fuente es
    mensual, así que cada operación queda fechada al cierre del mes en que ocurrió."""
    cache: dict[str, float] = {}
    base = acumulado_fmi(menos_dias(INICIO_PROGRAMA_FMI, 1), cache)
    hoy = dt.date.today()
    out: list[dict] = []
    previo = base
    d = dt.date.fromisoformat(INICIO_PROGRAMA_FMI)
    while True:
        fin = (d.replace(day=28) + dt.timedelta(days=4)).replace(day=1) - dt.timedelta(days=1)
        if fin >= hoy:
            break
        v = acumulado_fmi(fin.isoformat(), cache)
        if abs(v - previo) >= 1:
            out.append({"fecha": fin.isoformat(), "deg": v - base})
            previo = v
        d = fin + dt.timedelta(days=1)
    return out


# ── construcción ─────────────────────────────────────────────────────────────


def construir(ins: Insumos, out: Path) -> dict:
    hoy = dt.date.today().isoformat()
    S = {n: Serie.de(ins.bcra(n)) for n in fuentes.SERIES_BCRA}
    xdr = Serie.de(ins.xdr())
    planillas = ins.planillas()
    fechas_pl = sorted(planillas)
    try:
        escalones = ins.compras_fmi()
        error_fmi = None
    except Exception as e:  # noqa: BLE001 — imf.org caído no debe frenar el resto del pipeline
        escalones = None
        error_fmi = f"{type(e).__name__}: {e}"[:300]
        print(f"AVISO: sin datos del FMI ({error_fmi}); la réplica de la RIN queda sin dato")

    def dep_tesoro_usd(f: str) -> float | None:
        ars = S["dep_tesoro_ars"].en(f, max_dias=5)
        tc = S["a3500"].en(f, max_dias=7)
        if ars is None or tc is None or f < DESDE_DIARIA_RESERVAS:
            return None
        return ars / tc

    def comp_de(p: irfcl.Planilla) -> dict:
        return componentes_planilla(p, S["encajes_usd"].en(p.fecha), dep_tesoro_usd(p.fecha))

    comps = {f: comp_de(planillas[f]) for f in fechas_pl}

    def compras_fmi_usd(f: str) -> float | None:
        if escalones is None:
            return None
        deg = 0.0
        for e in escalones:
            if e["fecha"] <= f:
                deg = e["deg"]
        x = xdr.en(f, max_dias=10)
        return deg * x if (deg and x) else 0.0

    # ── Serie mensual (fin de mes, desde las planillas) ──
    mensual = []
    for f in fechas_pl:
        p, c = planillas[f], comps[f]
        enc = c["encajes_planilla"]
        dtes = c["dep_tesoro_planilla"]
        r = perimetros(p.brutas, enc, dtes, c)
        mensual.append(
            {
                "f": f,
                "brutas": r1(p.brutas),
                "encajes": r1(enc),
                "swaps": r1(c["swaps"]),
                "pases": r1(c["pases"]),
                "agrupado": c["agrupado"],
                "otros_bcra": r1(r["otros_bcra"]),
                "otros_bcra_mas_tesoro": r1(c["otros_bcra_mas_tesoro"]),
                "dep_tesoro": r1(dtes),
                "deuda_tesoro_12m": r1(c["deuda_tesoro_12m"]),
                "netas_a": r1(r["netas_a"]),
                "super_a": r1(r["super_a"]),
                "netas_b": r1(r["netas_b"]),
            }
        )

    # ── Serie diaria (desde 2024): brutas, encajes y dep. Tesoro diarios + componentes de la última planilla ──
    diaria = []
    for f in S["reservas"].fechas:
        if f < DESDE_DIARIA_RESERVAS:
            continue
        fp = max((x for x in fechas_pl if x <= f), default=None)
        if fp is None or dias_entre(fp, f) > MAX_DIAS_COMPONENTES:
            # hueco de planillas (jul-2023 a may-2024 no publicadas): sin componentes mensuales vigentes
            continue
        c = comps[fp]
        brutas = S["reservas"].en(f)
        enc = S["encajes_usd"].en(f, max_dias=5)
        dtes = dep_tesoro_usd(f)
        if enc is None:
            continue
        r = perimetros(brutas, enc, dtes, c)
        diaria.append(
            {
                "f": f,
                "brutas": r1(brutas),
                "encajes": r1(enc),
                "dep_tesoro": r1(dtes),
                "planilla": fp,
                "netas_a": r1(r["netas_a"]),
                "super_a": r1(r["super_a"]),
                "netas_b": r1(r["netas_b"]),
                "rin_fmi": r1(rin_fmi(brutas, enc, c, fmi)) if (fmi := compras_fmi_usd(f)) is not None else None,
            }
        )

    ult = diaria[-1]
    fp = ult["planilla"]
    c = comps[fp]
    brutas_u, enc_u, dtes_u = ult["brutas"], ult["encajes"], ult["dep_tesoro"]

    # ── Waterfalls del último dato + chequeos ──
    wf = {per: lineas_waterfall(brutas_u, enc_u, dtes_u, c, per) for per in ("A", "B")}
    fechas_comp = {
        "brutas": ult["f"],
        "encajes": S["encajes_usd"].fecha_en(ult["f"]),
        "dep_tesoro": S["dep_tesoro_ars"].fecha_en(ult["f"]),
    }

    def meta_linea(l: dict) -> dict:
        fid = l["id"]
        fuente, frec = FUENTES_META.get(fid, ("Cálculo propio", None))
        fecha = fechas_comp.get(fid, fp if frec == "mensual" else ult["f"])
        atraso = None
        if frec:
            atraso = dias_entre(fecha, hoy) > MAX_DIAS[frec]
        return {
            **l,
            "monto": r1(l["monto"]),
            "fecha": fecha,
            "fuente": fuente,
            "frecuencia": frec,
            "criterio": CRITERIOS.get(fid, ""),
            "desactualizado": atraso,
        }

    waterfalls = {per: [meta_linea(l) for l in ls] for per, ls in wf.items()}

    errores_wf = []
    for fila in diaria + mensual:
        pass  # los totales de las series salen de perimetros(); el chequeo explícito va sobre los waterfalls
    for f in [d["f"] for d in diaria] + fechas_pl:
        es_m = f in comps and f in planillas
        cc = comps[f] if es_m else comps[max(x for x in fechas_pl if x <= f)]
        if es_m:
            b, e, d_ = planillas[f].brutas, cc["encajes_planilla"], cc["dep_tesoro_planilla"]
        else:
            b, e, d_ = S["reservas"].en(f), S["encajes_usd"].en(f, max_dias=5), dep_tesoro_usd(f)
        if e is None:
            continue
        for per in ("A", "B"):
            for id_, decl, calc in suma_waterfall(lineas_waterfall(b, e, d_, cc, per)):
                if decl is not None and abs(decl - calc) > 0.01:
                    errores_wf.append(f"{f} {per} {id_}: {decl} ≠ {calc}")

    # ── Réplica RIN FMI vs. staff ──
    anclas = []
    for a in ANCLAS_STAFF_FMI:
        fila = next((d for d in reversed(diaria) if d["f"] <= a["fecha"]), None)
        rep = fila["rin_fmi"] if fila else None
        anclas.append(
            {
                **a,
                "replica": rep,
                "error": r1(rep - a["rin"]) if rep is not None else None,
                "planilla": fila["planilla"] if fila else None,
            }
        )
    errs = [abs(x["error"]) for x in anclas if x["error"] is not None]
    rin_publicable = (
        escalones is not None and bool(errs) and max(errs) <= TOLERANCIA_RIN and not any(e.get("aprox") for e in escalones)
    )

    # ── Calendario ≤ 12 meses por deudor (último corte de planilla) ──
    t = c["tramos"]
    tramos = ["m1", "m3", "m12"]
    otros_cap = {k: t["bcra_capital"][k] for k in tramos}
    # en ≤1m el capital de II.1 del BCRA incluye depósitos (encajes, Tesoro, cheques): no son vencimientos
    p_ult = planillas[fp]
    depositos_1m = (p_ult.notas.get("encajes") or 0) + (p_ult.notas.get("dep_tesoro") or 0)
    otros_cap["m1"] = max(otros_cap["m1"] - depositos_1m, 0.0)
    calendario = {
        "planilla": fp,
        "tramos": ["Hasta 1 mes", "1 a 3 meses", "3 a 12 meses"],
        "series": [
            {"id": "bcra_pases", "deudor": "BCRA", "concepto": "Pases con bancos" if not c["agrupado"] else "Swaps y pases",
             "valores": [r1(t["bcra_pases"][k]) for k in tramos]},
            {"id": "bcra_otros", "deudor": "BCRA", "concepto": "BOPREAL, organismos y otros (capital)",
             "valores": [r1(otros_cap[k]) for k in tramos]},
            {"id": "bcra_intereses", "deudor": "BCRA", "concepto": "Intereses",
             "valores": [r1(t["bcra_intereses"][k]) for k in tramos]},
            {"id": "gob_capital", "deudor": "Tesoro", "concepto": "Capital (FMI, organismos, bonos, repos)",
             "valores": [r1(t["gob_capital"][k]) for k in tramos]},
            {"id": "gob_intereses", "deudor": "Tesoro", "concepto": "Intereses",
             "valores": [r1(t["gob_intereses"][k]) for k in tramos]},
        ],
        "swaps": [r1(t["bcra_swaps"][k]) for k in tramos],
        "nota": (
            "La planilla del BCRA informa vencimientos por tramos (≤1 m, 1–3 m, 3–12 m), no mes a mes. "
            "El swap con China no se cuenta como vencimiento: la planilla registra cada operación a 3–12 meses, pero el "
            "acuerdo marco se renovó en agosto de 2026 por cinco años (hasta 2031) y las operaciones se renuevan dentro "
            "de él. Se sigue restando de las reservas netas porque suma completo a las brutas."
        ),
    }

    # ── Test de no doble conteo (desembolso del FMI depositado en el Tesoro en el BCRA) ──
    X = 1000.0
    base = perimetros(brutas_u, enc_u, dtes_u, c)
    c2 = dict(c)
    c2["deuda_tesoro_12m"] = c["deuda_tesoro_12m"] + 0.0  # el préstamo del FMI no vence en 12 m
    shock = perimetros(brutas_u + X, enc_u, (dtes_u or 0) + X, c2)
    doble_conteo = {
        "desembolso": X,
        "delta_super_a": r1(shock["super_a"] - base["super_a"]) if base["super_a"] is not None else None,
        "delta_netas_b": r1(shock["netas_b"] - base["netas_b"]) if base["netas_b"] is not None else None,
    }
    ok_dc = doble_conteo["delta_super_a"] in (0.0, None) and doble_conteo["delta_netas_b"] in (X, None)

    reservas = {
        "generado": dt.datetime.now(dt.UTC).replace(microsecond=0, tzinfo=None).isoformat() + "Z",
        "ultimo": {**ult, "planilla": fp},
        "diaria": diaria,
        "mensual": mensual,
        "waterfalls": waterfalls,
        "meta": {
            k: {"fuente": FUENTES_META.get(k, ("Cálculo propio", None))[0],
                "frecuencia": FUENTES_META.get(k, ("", None))[1],
                "criterio": CRITERIOS.get(k, "")}
            for k in set(FUENTES_META) | set(CRITERIOS)
        },
        "calendario": calendario,
        "rin_fmi": {
            "publicable": rin_publicable,
            "tolerancia": TOLERANCIA_RIN,
            "anclas": anclas,
            "escalones_fmi": escalones or [],
            "error_fuente": error_fmi,
            "definicion": (
                "Brutas − encajes − swaps (PBOC, BIS, ESF) − otros pasivos en ME de plazo original ≤ 1 año "
                "− compras netas al FMI desde el inicio del programa (abril de 2025). Los depósitos y la "
                "deuda del Tesoro no se restan (TMU, ¶11)."
            ),
        },
        "validacion": {
            "waterfall_ok": not errores_wf,
            "waterfall_errores": errores_wf[:20],
            "no_doble_conteo_ok": ok_dc,
            "no_doble_conteo": doble_conteo,
            "brutas_vs_api": [
                {"f": f, "planilla": r1(planillas[f].brutas), "api": r1(S["reservas"].en(f, max_dias=0))}
                for f in fechas_pl
                if S["reservas"].en(f, max_dias=0) is not None
                and abs(planillas[f].brutas - S["reservas"].en(f, max_dias=0)) > 2
            ],
            "planillas_faltantes": faltantes(fechas_pl),
            "advertencias_parser": {f: planillas[f].advertencias for f in fechas_pl if planillas[f].advertencias},
        },
    }

    # ── Cotizaciones y banda ──
    a35 = S["a3500"]
    cot = {
        "a3500": [[f, r2(v)] for f, v in zip(a35.fechas, a35.valores) if f >= DESDE_COTIZ],
        "piso": [[f, r2(v)] for f, v in zip(S["banda_inf"].fechas, S["banda_inf"].valores)],
        "techo": [[f, r2(v)] for f, v in zip(S["banda_sup"].fechas, S["banda_sup"].valores)],
    }
    for tipo in ("mep", "ccl", "blue", "cripto"):
        pts = [d for d in ins.cotiz(tipo) if d["fecha"] >= DESDE_COTIZ and d.get("venta")]
        cot[tipo] = [[d["fecha"], r2(d["venta"])] for d in pts]

    f_u = a35.fechas[-1]
    o_u = a35.valores[-1]
    piso_u = S["banda_inf"].en(f_u)
    techo_u = S["banda_sup"].en(f_u)
    f_3m = menos_dias(f_u, 91)
    o_3m = a35.en(f_3m)
    techo_3m = S["banda_sup"].en(f_3m)
    piso_3m = S["banda_inf"].en(f_3m)
    dias_3m = dias_entre(a35.fecha_en(f_3m), f_u)
    g_o = ritmo_mensual(o_u, o_3m, dias_3m)
    g_t = ritmo_mensual(techo_u, techo_3m, dias_3m) if techo_3m else None
    g_p = ritmo_mensual(piso_u, piso_3m, dias_3m) if piso_3m else None

    def ultimo_de(lista):
        return lista[-1] if lista else None

    banda = {
        "fecha": f_u,
        "oficial": r2(o_u),
        "piso": r2(piso_u),
        "techo": r2(techo_u),
        "dist_techo_pct": r2((techo_u / o_u - 1) * 100),
        "dist_piso_pct": r2((1 - piso_u / o_u) * 100),  # cuánto tendría que caer el oficial para tocar el piso
        "posicion_pct": r2((o_u - piso_u) / (techo_u - piso_u) * 100),
        "ritmo_oficial_3m": r2(g_o * 100),
        "ritmo_techo_3m": r2(g_t * 100) if g_t is not None else None,
        "ritmo_piso_3m": r2(g_p * 100) if g_p is not None else None,
        "meses_al_techo": r1(meses_hasta(o_u, techo_u, g_o, g_t, arriba=True)) if g_t is not None else None,
        "meses_al_piso": r1(meses_hasta(o_u, piso_u, g_o, g_p, arriba=False)) if g_p is not None else None,
        "ventana_dias": dias_3m,
    }
    cotizaciones = {
        "generado": reservas["generado"],
        "series": cot,
        "banda": banda,
        "ultimos": {k: ultimo_de(v) for k, v in cot.items()},
        "regla_banda": {
            "texto": (
                "Desde el 1 de enero de 2026, el ritmo de deslizamiento mensual del techo y del piso de la "
                "banda se determina según el último dato de inflación mensual informado por el INDEC (T-2). "
                "Hasta el 31 de diciembre de 2025: piso −1 % y techo +1 % mensual desde $1.000–1.400 (11-abr-2025)."
            ),
            "fuente": "BCRA, Régimen de bandas cambiarias",
            "url": "https://www.bcra.gob.ar/regimen-de-bandas-cambiarias/",
            "serie": "BCRA, API v4 · variables 1187 (límite inferior) y 1188 (límite superior)",
        },
    }

    # ── Compras del BCRA ──
    comp_s = S["compras_bcra"]
    diarias = [[f, r1(v)] for f, v in zip(comp_s.fechas, comp_s.valores) if f >= DESDE_DIARIA_RESERVAS]

    def suma_ventana(fin: str, n: int) -> float:
        ini = menos_dias(fin, n)
        return sum(v for f, v in zip(comp_s.fechas, comp_s.valores) if ini < f <= fin)

    acum = []
    for f, _ in diarias:
        acum.append([f, r1(suma_ventana(f, 30)), r1(suma_ventana(f, 90))])
    f_c = comp_s.fechas[-1]
    anio = f_c[:4]
    compras = {
        "generado": reservas["generado"],
        "diarias": diarias,
        "acum": acum,
        "ultimo": {
            "fecha": f_c,
            "dia": r1(comp_s.valores[-1]),
            "d30": r1(suma_ventana(f_c, 30)),
            "d90": r1(suma_ventana(f_c, 90)),
            "anio": r1(sum(v for f, v in zip(comp_s.fechas, comp_s.valores) if f.startswith(anio))),
            "anio_ref": anio,
        },
        "tesoro": {
            "disponible": False,
            "nota": (
                "No hay una serie oficial pública y diaria de compras de divisas del Tesoro. "
                "No se estima: se muestra sin dato."
            ),
        },
        "fuente": "BCRA, API v4 · variable 78 (factores de variación de reservas: compra de divisas)",
    }

    # ── Manifest ──
    def estado(fecha: str | None, frec: str) -> dict:
        return {
            "ultimo": fecha,
            "frecuencia": frec,
            "desactualizado": (fecha is None) or dias_entre(fecha, hoy) > MAX_DIAS[frec],
        }

    manifest = {
        "generado": reservas["generado"],
        "fuentes": {
            "a3500": estado(a35.fechas[-1], "diaria"),
            "banda": estado(S["banda_sup"].fechas[-1], "diaria"),
            "mep": estado(ultimo_de(cot["mep"])[0] if cot["mep"] else None, "diaria"),
            "ccl": estado(ultimo_de(cot["ccl"])[0] if cot["ccl"] else None, "diaria"),
            "blue": estado(ultimo_de(cot["blue"])[0] if cot["blue"] else None, "diaria"),
            "cripto": estado(ultimo_de(cot["cripto"])[0] if cot["cripto"] else None, "diaria"),
            "reservas": estado(S["reservas"].fechas[-1], "diaria"),
            "encajes": estado(S["encajes_usd"].fechas[-1], "diaria"),
            "dep_tesoro": estado(S["dep_tesoro_ars"].fechas[-1], "diaria"),
            "compras_bcra": estado(comp_s.fechas[-1], "diaria_rezagada"),  # la variable 78 se publica con ~6 días hábiles de rezago
            "planilla_nedd": estado(fechas_pl[-1], "mensual"),
        },
    }

    out.mkdir(parents=True, exist_ok=True)
    for nombre, obj in (
        ("cotizaciones", cotizaciones),
        ("compras", compras),
        ("reservas", reservas),
        ("manifest", manifest),
    ):
        (out / f"{nombre}.json").write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
    return {"reservas": reservas, "cotizaciones": cotizaciones, "compras": compras, "manifest": manifest}


def faltantes(fechas: list[str]) -> list[str]:
    if not fechas:
        return []
    meses = {f[:7] for f in fechas}
    out = []
    y, m = int(fechas[0][:4]), int(fechas[0][5:7])
    yu, mu = int(fechas[-1][:4]), int(fechas[-1][5:7])
    while (y, m) <= (yu, mu):
        k = f"{y}-{m:02d}"
        if k not in meses:
            out.append(k)
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--raw", default=None)
    a = ap.parse_args()
    res = construir(Insumos(Path(a.raw) if a.raw else None), Path(a.out))
    r = res["reservas"]
    u = r["ultimo"]
    print(f"Reservas {u['f']}: brutas {u['brutas']} · netas A {u['netas_a']} · super A {u['super_a']} · netas B {u['netas_b']} (planilla {u['planilla']})")
    print(f"RIN FMI (réplica) {u['rin_fmi']} · publicable={r['rin_fmi']['publicable']}")
    for x in r["rin_fmi"]["anclas"]:
        print(f"  ancla {x['fecha']}: staff {x['rin']} · réplica {x['replica']} · error {x['error']}")
    v = r["validacion"]
    print(f"Waterfall OK={v['waterfall_ok']} · no doble conteo OK={v['no_doble_conteo_ok']} {v['no_doble_conteo']}")
    print(f"Planillas faltantes: {v['planillas_faltantes']}")
    b = res["cotizaciones"]["banda"]
    print(f"Banda {b['fecha']}: oficial {b['oficial']} piso {b['piso']} techo {b['techo']} · al techo {b['dist_techo_pct']}% · meses {b['meses_al_techo']}")
    if not v["waterfall_ok"] or not v["no_doble_conteo_ok"]:
        raise SystemExit("Validación de reservas fallida")


if __name__ == "__main__":
    main()
