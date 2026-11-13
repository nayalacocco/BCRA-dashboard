"""
M2 — tests con paneles sintéticos de comportamiento conocido.
"""

import numpy as np
import pandas as pd
import pytest

from inflacion import difusion as dif
from inflacion.desest import ajustar_serie, normalizar_estacional


def _panel(pi: np.ndarray) -> pd.DataFrame:
    """pi: T×N de variaciones m/m (fracción) → índices base 100 con T+1 filas."""
    T, N = pi.shape
    idx = np.vstack([np.full(N, 100.0), 100.0 * np.cumprod(1 + pi, axis=0)])
    return pd.DataFrame(idx, index=pd.date_range("2017-01-01", periods=T + 1, freq="MS"), columns=[f"i{j}" for j in range(N)])


def _run(pi, w=None):
    panel = _panel(pi)
    wb = pd.Series(1.0 if w is None else w, index=panel.columns)
    wb = wb / wb.sum()
    return dif.metricas(panel, wb, dif.indice_agregado(panel, wb)), panel, wb


def test_rotacion_perfecta():
    """Tres grupos que suben por turnos: todos lideran una vez por trimestre y el precio relativo revierte."""
    T, N = 30, 6
    pi = np.full((T, N), 0.01)
    for t in range(T):
        pi[t, [j for j in range(N) if j % 3 == t % 3]] = 0.06
    m, _, _ = _run(pi)
    assert np.allclose(m["C"][3][2:], 100.0)
    assert np.nanmax(m["VR"][3]) < 1e-6          # VR < 1 (acá, exactamente 0)
    assert np.allclose(m["D"], 100 * 2 / 6, atol=1.5)  # un tercio lidera cada mes
    assert (m["C"][3][2:] > m["Cref"][3][2:]).all()    # más rotación que al azar
    assert np.nanmax(m["rho"]) < 0                     # el que subió más, sube menos al mes siguiente


def test_shock_persistente_en_subconjunto():
    """Un subconjunto sube siempre más que el resto: cambio persistente de precios relativos."""
    T, N = 14, 60
    pi = np.full((T, N), 0.01)
    pi[:, :12] = 0.05
    m, _, _ = _run(pi)
    assert np.nanmin(m["VR"][3]) > 2.5            # VR(k) → k
    assert np.nanmin(m["VR"][6]) > 5.0
    assert np.allclose(m["C"][3][2:], m["D"][:-2], atol=1e-9)  # siempre los mismos: C(k) = D al inicio de la ventana
    assert (m["C"][3][2:] < m["Cref"][3][2:]).all()
    lo, hi = m["VRbanda"][3]
    assert lo < 1 < hi < 2.0                      # la banda nula queda centrada en 1 aunque la deriva sea permanente
    reg = dif.regimen(m)
    assert set(reg["codigo"][3:]) == {"concentrada_persistente"}


def test_todos_iguales_no_rompe():
    pi = np.full((20, 8), 0.02)
    m, _, _ = _run(pi)
    assert np.isnan(m["D"]).all()
    assert np.isnan(m["VR"][3]).all() and np.isnan(m["A"][12]).all() and np.isnan(m["rho"][1:]).all()
    assert np.allclose(m["buckets"].sum(axis=1), 100.0)
    assert np.allclose(m["buckets"][:, dif.N_DEBAJO:].sum(axis=1), 0.0)  # nadie supera al promedio
    assert set(dif.regimen(m)["codigo"]) == {"intermedia"}


def test_ruido_iid_vr_cerca_de_1():
    rng = np.random.default_rng(7)
    pi = 0.02 + rng.normal(0, 0.01, (60, 1500))
    m, _, _ = _run(pi)
    for k in dif.KS:
        assert np.nanmean(m["VR"][k]) == pytest.approx(1.0, abs=0.06)
        lo, hi = m["VRbanda"][k]
        assert lo < 1 < hi
    assert abs(np.nanmean(m["rho"])) < 0.03


def test_D_ponderado_es_el_peso_efectivo():
    pi = np.full((5, 2), 0.01)
    pi[:, 1] = 0.03
    m, panel, wb = _run(pi, w=[0.8, 0.2])
    w_eff = dif.pesos_efectivos(panel, wb).iloc[1:]
    assert np.allclose(m["D"], 100 * w_eff["i1"].values)


def test_acumulada_agrega_exacto_con_pesos_de_inicio_de_ventana():
    rng = np.random.default_rng(3)
    pi = 0.02 + rng.normal(0, 0.02, (24, 12))
    w = rng.uniform(0.5, 2, 12)
    _, panel, wb = _run(pi, w=w)
    H = dif.indice_agregado(panel, wb)
    W = dif.pesos_efectivos(panel, wb)
    k, t = 6, 20  # ventana que termina en la fila t del panel
    acum_i = panel.iloc[t] / panel.iloc[t - k] - 1
    assert float((W.iloc[t - k + 1] * acum_i).sum()) == pytest.approx(H.iloc[t] / H.iloc[t - k] - 1, rel=1e-12)


def test_identidad_vr_autocovarianza():
    rng = np.random.default_rng(11)
    R = rng.normal(0, 1, (3, 50))
    w = np.full(50, 1 / 50)
    vr = dif.vr_serie(R, np.tile(w, (3, 1)), 3)[2]
    Rc = R - R.mean(axis=1, keepdims=True)
    cov = sum((Rc[j] * Rc[l]).mean() for j in range(3) for l in range(j + 1, 3))
    assert vr == pytest.approx(1 + 2 * cov / sum((Rc[j] ** 2).mean() for j in range(3)), rel=1e-10)


def test_reglas_de_regimen():
    b = (0.75, 1.25)
    assert dif.clasificar(48, 0.6, 5, b) == "generalizada_escalonada"
    assert dif.clasificar(48, 0.9, 5, b) == "generalizada_escalonada"   # dentro de banda, C confirma
    assert dif.clasificar(48, 0.9, -5, b) == "intermedia"               # dentro de banda, C no confirma
    assert dif.clasificar(48, 1.6, -5, b) == "generalizada_persistente"
    assert dif.clasificar(35, 1.6, 2, b) == "concentrada_persistente"   # fuera de banda: manda VR
    assert dif.clasificar(35, 0.5, -1, b) == "concentrada_transitoria"
    assert dif.clasificar(42, 1.6, -5, b) == "intermedia"               # amplitud intermedia
    assert dif.clasificar(np.nan, 1.6, -5, b) == "intermedia"


def test_desestacionalizacion():
    rng = np.random.default_rng(5)
    fechas = pd.date_range("2016-12-01", periods=119, freq="MS")
    est = 0.012 * np.sin(2 * np.pi * (fechas.month[1:] - 1) / 12)
    ruido = rng.normal(0, 0.002, 118)
    con = pd.Series(100 * np.concatenate([[1], np.exp(np.cumsum(0.02 + est + ruido))]), index=fechas)
    sin = pd.Series(100 * np.concatenate([[1], np.exp(np.cumsum(0.02 + ruido))]), index=fechas)

    sa, p, adj = ajustar_serie(con)
    assert adj and p < 0.01
    assert np.log(sa).diff().std() < 0.4 * np.log(con).diff().std()
    # sin deriva: la interanual desestacionalizada queda pegada a la original
    assert ((sa / sa.shift(12)) / (con / con.shift(12)) - 1).abs().max() < 0.01

    sa2, p2, adj2 = ajustar_serie(sin)
    assert not adj2 and sa2.equals(sin)


def test_normalizacion_estacional():
    s = np.tile(np.sin(2 * np.pi * np.arange(12) / 12), 5)
    assert np.allclose(normalizar_estacional(s), s, atol=1e-12)
    assert np.allclose(normalizar_estacional(s + 0.3), s, atol=1e-12)


def test_tramos_sobre_el_promedio_suman_D():
    rng = np.random.default_rng(7)
    pi = 0.03 + rng.normal(0, 0.012, size=(30, 40))
    m, _, _ = _run(pi)
    assert np.allclose(m["buckets"].sum(axis=1), 100.0)
    assert np.allclose(m["buckets"][:, dif.N_DEBAJO:].sum(axis=1), m["D"], atol=1e-6)
