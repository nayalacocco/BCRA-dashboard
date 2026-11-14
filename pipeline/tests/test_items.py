"""
Tests con paneles sintéticos: construcción de residuales, ponderadores efectivos y reconciliación.
Las métricas de difusión/rotación (M2) agregan sus propios tests en F2.
"""

import numpy as np
import pandas as pd
import pytest

from inflacion import indec
from inflacion.items import build_panel, leaves, pesos_efectivos, variaciones
from inflacion.validate import reconciliacion

FECHAS = pd.date_range("2016-12-01", periods=13, freq="MS")


def _df(rows):
    return pd.DataFrame(rows, columns=["codigo", "descripcion", "clasificador", "fecha", "indice", "vm", "via", "region"])


def _synthetic(seed=0):
    """
    Una economía con 2 divisiones por región:
      01 (peso .6) con aperturas 01.1 (.4) y 01.2 (.15) → resto .05
      02 (peso .4) sin aperturas → resto = toda la división
    Índices de división construidos como Laspeyres exacto de sus componentes.
    """
    rng = np.random.default_rng(seed)
    div_rows, ap_rows, pond_rows = [], [], []
    nac = pd.Series(0.0, index=FECHAS)
    for r in indec.REGIONES:
        W = indec.PESO_REGION_NORM[r]
        comps = {"01.1": 0.40, "01.2": 0.15, "01.R": 0.05, "02.R": 0.40}
        idx = {}
        for c in comps:
            g = 1 + rng.normal(0.03, 0.02, len(FECHAS))
            g[0] = 1.0
            idx[c] = 100 * np.cumprod(g)
        d01 = (0.40 * idx["01.1"] + 0.15 * idx["01.2"] + 0.05 * idx["01.R"]) / 0.60
        d02 = idx["02.R"]
        ng = 0.6 * d01 + 0.4 * d02
        nac += W * pd.Series(ng, index=FECHAS)
        for f, a, b, n in zip(FECHAS, d01, d02, ng):
            div_rows += [
                ["0", "Nivel general", "Nivel general y divisiones COICOP", f, n, None, None, r],
                ["01", "Div 1", "Nivel general y divisiones COICOP", f, a, None, None, r],
                ["02", "Div 2", "Nivel general y divisiones COICOP", f, b, None, None, r],
            ]
        for i, f in enumerate(FECHAS):
            ap_rows += [
                ["01", "Div 1", "Nivel general y divisiones COICOP", f, d01[i], None, None, r],
                ["01.1", "Ap 1", "Grupos", f, idx["01.1"][i], None, None, r],
                ["01.2", "Ap 2", "Grupos", f, idx["01.2"][i], None, None, r],
                ["02", "Div 2", "Nivel general y divisiones COICOP", f, d02[i], None, None, r],
            ]
        pond_rows += [
            {"codigo": "01", "descripcion": "", "region": r, "peso": 0.60},
            {"codigo": "01.1", "descripcion": "", "region": r, "peso": 0.40},
            {"codigo": "01.2", "descripcion": "", "region": r, "peso": 0.15},
            {"codigo": "02", "descripcion": "", "region": r, "peso": 0.40},
        ]
        truth = {f"{r}:01.R": idx["01.R"]}
    for f, v in zip(FECHAS, nac):
        div_rows.append(["0", "Nivel general", "Nivel general y divisiones COICOP", f, v, None, None, "Nacional"])
    return _df(div_rows), _df(ap_rows), pd.DataFrame(pond_rows), truth


def test_leaves():
    assert leaves(["0", "01", "01.1", "01.1.1", "01.2", "10"]) == ["01.1.1", "01.2", "10"]


def test_residual_recupera_componente_no_publicado():
    div, ap, pond, truth = _synthetic()
    items, panel, warns = build_panel(div, ap, pond)
    (k, v), = truth.items()
    assert np.allclose(panel[k].values, v, rtol=1e-10)
    assert not warns


def test_pesos_efectivos_suman_1():
    div, ap, pond, _ = _synthetic(1)
    items, panel, _ = build_panel(div, ap, pond)
    w = pesos_efectivos(items, panel).iloc[1:]
    assert np.allclose(w.sum(axis=1), 1.0)


def test_reconciliacion_exacta_en_laspeyres():
    div, ap, pond, _ = _synthetic(2)
    items, panel, _ = build_panel(div, ap, pond)
    check, rec = reconciliacion(items, panel, div)
    assert check.ok, check.detalle
    assert rec.desvio_pp.abs().max() < 1e-8


def test_peso_nacional_suma_1():
    div, ap, pond, _ = _synthetic(3)
    items, _, _ = build_panel(div, ap, pond)
    assert sum(i.peso_nacional for i in items) == pytest.approx(1.0, abs=1e-9)


def test_imputacion_con_variacion_de_division():
    from inflacion.items import imputar_con_division
    idx_div = pd.Series([100.0, 110.0, 121.0, 133.1], index=FECHAS[:4])
    s = pd.Series([100.0, 105.0, np.nan, 120.0], index=FECHAS[:4])
    out, faltan = imputar_con_division(s, idx_div)
    assert faltan == [FECHAS[2]]
    assert out.iloc[2] == pytest.approx(105.0 * 1.1)


def test_reconciliacion_con_meses_faltantes():
    """Un mes sin dato en una apertura (como abr-2020) no rompe la reconstrucción del headline."""
    div, ap, pond, _ = _synthetic(4)
    mask = (ap.codigo == "01.1") & (ap.fecha == FECHAS[5])
    ap.loc[mask, "indice"] = np.nan
    items, panel, _ = build_panel(div, ap, pond)
    assert not panel.isna().any().any()
    check, rec = reconciliacion(items, panel, div)
    assert rec.desvio_pp.abs().max() < 1e-8
