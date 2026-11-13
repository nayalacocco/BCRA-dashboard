"""Tests del pipeline de tipo de cambio: parser de la planilla NEDD-FMI y perímetros de reservas."""

from __future__ import annotations

import math
from pathlib import Path

import pytest

from fx import irfcl
from fx.fuentes import parse_imf_transacciones
from fx.reservas import (
    componentes_planilla,
    lineas_waterfall,
    meses_hasta,
    perimetros,
    ritmo_mensual,
    suma_waterfall,
)

FIX = Path(__file__).parent / "fixtures" / "irfcl"


def _p(nombre: str) -> irfcl.Planilla:
    return irfcl.parse((FIX / f"{nombre}.pdf").read_bytes())


# ── Parser ───────────────────────────────────────────────────────────────────


def test_num_ambos_formatos():
    assert irfcl.num("29.639,73") == pytest.approx(29639.73)
    assert irfcl.num("62,023.84") == pytest.approx(62023.84)
    assert irfcl.num("-0,22") == pytest.approx(-0.22)
    assert irfcl.num("1.124,5") == pytest.approx(1124.5)


def test_parser_2026_09_valores_conocidos():
    p = _p("2026-09")
    assert p.fecha == "2026-09-30"
    assert p.brutas == pytest.approx(46091.73)
    assert p.swaps["total"] == pytest.approx(19384.47)
    assert p.swaps["m12"] == pytest.approx(19384.47)
    assert p.recompras == pytest.approx({"total": 2488.11, "m1": 110.0, "m3": 626.87, "m12": 1751.24})
    assert p.bcra_total() == pytest.approx(16754.11, abs=0.02)
    assert p.gob_total() == pytest.approx(23786.79, abs=0.02)
    assert p.notas == {"encajes": 13293.22, "dep_tesoro": 1124.53, "cheques": 16.12, "otras_oblig": 70.4}
    # el capital ≤1m del BCRA son exactamente los depósitos de la nota (c)
    dep = sum(p.notas[k] for k in ("encajes", "dep_tesoro", "cheques", "otras_oblig"))
    assert p.bcra_capital["m1"] == pytest.approx(dep, abs=0.05)


def test_parser_formato_anglo_2018():
    p = _p("2018-01")
    assert p.fecha == "2018-01-31"
    assert p.brutas == pytest.approx(62023.84)
    assert p.recompras["total"] == pytest.approx(12402.42)
    assert p.gob_total() == pytest.approx(38813.11, abs=0.02)


def test_tramos_suman_total():
    for nombre in ("2018-01", "2022-11", "2026-09"):
        p = _p(nombre)
        for bloque in (p.bcra_capital, p.gob_capital, p.gob_intereses, p.recompras, p.swaps):
            assert bloque["m1"] + bloque["m3"] + bloque["m12"] == pytest.approx(bloque["total"], abs=0.05)


# ── Perímetros ───────────────────────────────────────────────────────────────


def _comp(p: irfcl.Planilla, enc=None, dt=None) -> dict:
    return componentes_planilla(p, enc, dt)


def test_waterfall_suma_igual_al_total_en_ambos_perimetros():
    p = _p("2026-09")
    c = _comp(p)
    for per in ("A", "B"):
        for _, decl, calc in suma_waterfall(lineas_waterfall(46091.73, 13293.22, 1124.53, c, per)):
            assert decl == pytest.approx(calc, abs=1e-6)


def test_perimetro_a_y_b_valores_2026_09():
    p = _p("2026-09")
    c = _comp(p)
    r = perimetros(p.brutas, 13293.22, 1124.53, c)
    assert r["netas_a"] == pytest.approx(46091.73 - 13293.22 - 19384.47 - 2488.11, abs=0.01)
    otros = 16754.11 - 13293.22 - 1124.53
    assert r["otros_bcra"] == pytest.approx(otros, abs=0.02)
    assert r["super_a"] == pytest.approx(r["netas_a"] - otros - 1124.53, abs=0.02)
    assert r["netas_b"] == pytest.approx(r["netas_a"] - otros - 23786.79, abs=0.02)


def test_no_doble_conteo_desembolso_fmi_depositado():
    """Un desembolso del FMI de X depositado por el Tesoro en el BCRA:
    - suma X a las brutas y X a los depósitos del Tesoro;
    - no vence en 12 meses (no cambia la deuda ≤12m del Tesoro).
    A super netas: no cambia (se resta una sola vez, como depósito). B: sube X (la deuda no vence en 12 m;
    los depósitos no se restan). En ninguna variante el desembolso reduce las reservas dos veces."""
    p = _p("2026-09")
    c = _comp(p)
    X = 1000.0
    base = perimetros(p.brutas, 13293.22, 1124.53, c)
    shock = perimetros(p.brutas + X, 13293.22, 1124.53 + X, c)
    assert shock["super_a"] - base["super_a"] == pytest.approx(0.0)
    assert shock["netas_b"] - base["netas_b"] == pytest.approx(X)
    assert shock["netas_a"] - base["netas_a"] == pytest.approx(X)
    # y si la cuota vence dentro de 12 meses, B la resta una sola vez (como deuda), no como depósito
    c2 = dict(c)
    c2["deuda_tesoro_12m"] = c["deuda_tesoro_12m"] + X
    shock2 = perimetros(p.brutas + X, 13293.22, 1124.53 + X, c2)
    assert shock2["netas_b"] - base["netas_b"] == pytest.approx(0.0)


def test_swap_china_y_pases_agrupados_antes_de_dic_2022():
    p = _p("2022-11")
    c = _comp(p, enc=10000.0)
    assert c["agrupado"] is True
    assert c["swaps"] == 0.0
    assert c["pases"] == pytest.approx(p.recompras["total"])
    ids = [l["id"] for l in lineas_waterfall(p.brutas, 10000.0, None, c, "A")]
    assert "swaps_pases" in ids and "swaps" not in ids


def test_perimetro_b_sin_dato_si_no_se_conocen_depositos_del_tesoro():
    p = _p("2018-01")
    c = _comp(p, enc=16093.33, dt=None)
    r = perimetros(p.brutas, 16093.33, None, c)
    assert r["netas_b"] is None  # restaría los depósitos del Tesoro dentro del residuo: no se calcula
    assert r["super_a"] == pytest.approx(r["netas_a"] - c["otros_bcra_mas_tesoro"])


# ── Ritmos y distancias ──────────────────────────────────────────────────────


def test_ritmo_mensual_y_meses_hasta_techo():
    g = ritmo_mensual(110.0, 100.0, 91)
    assert (1 + g) ** (91 / 30.4375) == pytest.approx(1.10)
    # nivel 100, techo 121, nivel sube 2 %/m, techo 0 %/m → ln(1,21)/ln(1,02)
    m = meses_hasta(100.0, 121.0, 0.02, 0.0, arriba=True)
    assert m == pytest.approx(math.log(1.21) / math.log(1.02))
    assert meses_hasta(100.0, 121.0, 0.01, 0.02, arriba=True) is None  # el techo sube más rápido
    # piso: nivel 100 cae 3 %/m, piso 80 cae 1 %/m
    m2 = meses_hasta(100.0, 80.0, -0.03, -0.01, arriba=False)
    assert m2 == pytest.approx(math.log(100 / 80) / (math.log(0.99) - math.log(0.97)))


def test_parse_imf_transacciones():
    html = (
        "<table><tr><td>2026</td><td>763,000,000</td><td>583,333,333</td><td>1,714,750,361</td></tr>"
        "<tr><td>2025</td><td>10,689,000,000</td><td>0</td><td>2,065,986,188</td></tr></table>"
    )
    t = parse_imf_transacciones(html)
    assert t[2026] == {"compras": 763e6, "recompras": 583333333.0, "cargos": 1714750361.0}
    assert t[2025]["compras"] == 10689e6
