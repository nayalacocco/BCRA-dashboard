"""Precios relativos con anclas: propiedades con paneles sintéticos."""

import numpy as np
import pandas as pd
import pytest

from inflacion import precios_relativos as prel


def _fechas(n):
    return pd.date_range("2016-12-01", periods=n, freq="MS")


def test_nivel_relativo_no_depende_de_la_base():
    f = _fechas(30)
    rng = np.random.default_rng(0)
    panel = pd.DataFrame(100 * np.exp(np.cumsum(rng.normal(0.02, 0.01, (30, 3)), axis=0)), index=f, columns=list("abc"))
    panel.iloc[0] = 100
    h = panel.mean(axis=1)
    L = prel.nivel_relativo(panel, h)
    # cambiar la base (multiplicar un ítem por una constante) desplaza L en una constante y deja el desvío igual
    L2 = prel.nivel_relativo(panel.assign(a=panel.a * 3), h)
    r1, r2 = prel.resumen_items(L), prel.resumen_items(L2)
    assert r1.loc["a", "desvio_filtrada"] == pytest.approx(r2.loc["a", "desvio_filtrada"], abs=1e-9)
    assert r1.loc["a", "d6"] == pytest.approx(r2.loc["a", "d6"], abs=1e-9)


def test_meses_sin_cepo():
    m = prel.meses_sin_cepo(pd.date_range("2019-07-01", "2025-05-01", freq="MS"))
    f = [f"{x:%Y-%m}" for x in pd.date_range("2019-07-01", "2025-05-01", freq="MS")]
    assert m[f.index("2019-08")] and not m[f.index("2019-09")]
    assert not m[f.index("2025-03")] and m[f.index("2025-04")]


def test_ancla_filtrada_ignora_meses_con_cepo():
    f = pd.date_range("2016-12-01", "2026-10-01", freq="MS")
    L = pd.DataFrame({"x": np.where(prel.meses_sin_cepo(f), 0.0, np.log(2.0))}, index=f)
    af, as_ = prel.anclas(L)
    assert af["x"] == pytest.approx(0.0)
    assert as_["x"] > 0.2


def test_backtest_detecta_reversion():
    """Un ítem que revierte a su ancla da β < 0 y acierto de signo alto."""
    f = pd.date_range("2016-12-01", "2026-10-01", freq="MS")
    rng = np.random.default_rng(3)
    T, N = len(f), 20
    L = np.zeros((T, N))
    for t in range(1, T):
        L[t] = 0.85 * L[t - 1] + rng.normal(0, 0.05, N)
    bt = prel.backtest(pd.DataFrame(L, index=f))
    assert bt["filtrada"]["beta"] < -0.3
    assert bt["filtrada"]["acierto_signo"] > 0.6
