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


def _run(pi, w=None, replicas=200):
    panel = _panel(pi)
    wb = pd.Series(1.0 if w is None else w, index=panel.columns)
    wb = wb / wb.sum()
    return dif.metricas(panel, wb, dif.indice_agregado(panel, wb), replicas=replicas), panel, wb


def test_rotacion_perfecta():
    """
    Tres grupos que suben por turnos dentro de cada trimestre (en un orden que cambia, para que el patrón no
    coincida con el calendario): todos lideran una vez por trimestre y el precio relativo revierte.
    """
    rng = np.random.default_rng(1)
    T, N = 48, 6
    pi = np.full((T, N), 0.01)
    for q in range(T // 3):
        for j, g in enumerate(rng.permutation(3)):
            pi[3 * q + j, [i for i in range(N) if i % 3 == g]] = 0.06
    m, _, _ = _run(pi)
    C3 = m["C"][3]
    trim = np.arange(2, T, 3)                  # ventanas alineadas con cada trimestre: cobertura total
    assert np.allclose(C3[trim], 100.0)
    p5, p50, p95 = m["nulo"]["C"][3]
    assert (C3[trim] > p50[trim]).all()       # se turnan más que en el null
    assert np.nanmax(m["VR"][3][trim]) < 1e-6  # al cerrar cada trimestre la suma de r es igual para todos
    assert np.allclose(m["D"], 100 * 2 / 6, atol=1.5)
    reg = dif.regimen(m)
    assert reg["dinamica"][trim[-1]] == "rotacion"


def test_shock_persistente_episodio():
    """
    Un subconjunto sube más que el resto durante un episodio de 12 meses (y el resto de la muestra es ruido):
    persistencia que el null no reproduce, porque permutar los años dispersa el episodio.
    """
    rng = np.random.default_rng(2)
    T, N = 60, 60
    pi = 0.02 + rng.normal(0, 0.004, (T, N))
    pi[36:48, :12] += 0.03
    m, _, _ = _run(pi)
    t = 46
    assert m["VR"][3][t] > m["nulo"]["VR"][3][2][t]      # VR sobre p95 del null
    assert m["C"][3][t] < m["nulo"]["C"][3][0][t]        # lideran los mismos: C bajo p5
    assert dif.regimen(m)["dinamica"][t] == "persistencia"


def test_deriva_constante_no_es_senal():
    """
    Un subconjunto sube siempre más que el resto, toda la muestra: el null conserva la deriva media de cada
    ítem, así que no lo marca como persistencia (es heterogeneidad, no memoria). Propiedad documentada.
    """
    rng = np.random.default_rng(4)
    T, N = 48, 60
    pi = 0.02 + rng.normal(0, 0.004, (T, N))
    pi[:, :12] += 0.01
    m, _, _ = _run(pi)
    p5, p50, p95 = m["nulo"]["VR"][3]
    assert np.nanmean(m["VR"][3]) > 2.0                 # VR observado alto…
    assert np.nanmean(np.abs(m["VR"][3] - p50)) < 0.6   # …pero en línea con el null


def test_todos_iguales_no_rompe():
    pi = np.full((20, 8), 0.02)
    m, _, _ = _run(pi)
    assert np.isnan(m["D"]).all()
    assert np.isnan(m["VR"][3]).all() and np.isnan(m["A"][12]).all() and np.isnan(m["rho"][1:]).all()
    assert np.allclose(m["buckets"].sum(axis=1), 100.0)
    assert np.allclose(m["buckets"][:, dif.N_DEBAJO:].sum(axis=1), 0.0)  # nadie supera al promedio
    assert set(dif.regimen(m)["codigo"]) == {"intermedia"}


def test_ruido_iid_dentro_del_null():
    rng = np.random.default_rng(7)
    pi = 0.02 + rng.normal(0, 0.01, (118, 200))   # mismo largo que la muestra real
    m, _, _ = _run(pi)
    for k in dif.KS:
        assert np.nanmean(m["VR"][k]) == pytest.approx(1.0, abs=0.08)
        p5, p50, p95 = m["nulo"]["VR"][k]
        dentro = (m["VR"][k] >= p5) & (m["VR"][k] <= p95)
        # nominal 90 %; con 10 años por mes calendario el null queda algo angosto (~84 % empírico)
        assert np.nanmean(dentro[~np.isnan(m["VR"][k])]) > 0.75
        assert np.nanmean(p50) == pytest.approx(1.0, abs=0.08)
    assert abs(np.nanmean(m["rho"])) < 0.03


def test_null_reproduce_c_y_vr_observados_sin_permutar():
    """c_y_vr (vectorizado, usado por el null) coincide con las definiciones de metricas."""
    from inflacion import nulo
    rng = np.random.default_rng(9)
    pi = 0.02 + rng.normal(0, 0.01, (30, 20))
    m, panel, wb = _run(pi)
    R = m["R"].values
    W = dif.pesos_efectivos(panel, wb).iloc[1:].values
    C, VR = nulo.c_y_vr(R[None], W, dif.KS)
    for k in dif.KS:
        assert np.allclose(C[k][0], m["C"][k], equal_nan=True)
        assert np.allclose(VR[k][0], m["VR"][k], equal_nan=True)


def test_permutacion_conserva_mes_calendario():
    from inflacion import nulo
    rng = np.random.default_rng(10)
    R = rng.normal(size=(36, 5))
    meses = np.arange(36) % 12
    Rp = nulo.permutar_por_mes(R, meses, rng, 3)
    for m_ in range(12):
        f = meses == m_
        for b in range(3):
            assert np.allclose(np.sort(Rp[b, f], axis=0), np.sort(R[f], axis=0))


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
    u, v, c = (40.0, 45.0), (0.8, 1.3), (75.0, 88.0)
    assert dif.clasificar(48, 0.6, 80, u, v, c) == "generalizada_escalonada"   # VR bajo p5
    assert dif.clasificar(48, 1.0, 90, u, v, c) == "generalizada_escalonada"   # C sobre p95
    assert dif.clasificar(48, 1.0, 80, u, v, c) == "intermedia"                # dentro de las dos bandas: ruido
    assert dif.clasificar(48, 1.6, 80, u, v, c) == "generalizada_persistente"
    assert dif.clasificar(35, 1.0, 70, u, v, c) == "concentrada_persistente"   # C bajo p5
    assert dif.clasificar(35, 0.5, 80, u, v, c) == "concentrada_transitoria"
    assert dif.clasificar(35, 1.6, 90, u, v, c) == "intermedia"                # señales contradictorias
    assert dif.clasificar(42, 1.6, 80, u, v, c) == "intermedia"                # amplitud intermedia
    assert dif.clasificar(np.nan, 1.6, 80, u, v, c) == "intermedia"


def test_umbrales_terciles():
    lo, hi = dif.umbrales_amplitud(np.arange(1.0, 100.0))
    assert lo == pytest.approx(33.67, abs=0.1) and hi == pytest.approx(66.33, abs=0.1)
    assert all(np.isnan(dif.umbrales_amplitud(np.array([1.0, 2.0]))))


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
