"""
Null por permutación para la rotación C(k) y el variance ratio VR(k).

Hipótesis nula: dentro de cada ítem, el orden de los años no importa. Cada ítem conserva
  - su distribución por mes calendario (estacionalidad residual: los eneros siguen siendo eneros),
  - su deriva media 2017–2026 (un rubro que en promedio sube más que el nivel general lo sigue haciendo),
  - su volatilidad,
y se rompe la dependencia entre meses consecutivos, que es lo que miden C(k) y VR(k).

Construcción: para cada réplica, ítem y mes calendario se permutan al azar los años de r_{i,t}. Con 2.000
réplicas se obtienen, para cada mes t, los percentiles 5, 50 y 95 de C_t(k) y VR_t(k). Los ponderadores
efectivos ω_{i,t} se mantienen los observados.

Por qué no 1 − Π(1 − D) (aproximación descartada): supone que en cada mes cualquier ítem tiene la misma
probabilidad de superar al nivel general. Los ítems son heterogéneos (algunos superan al promedio casi
siempre, otros casi nunca), y con heterogeneidad la cobertura esperada es menor que 1 − Π(1 − D) (desigualdad
de Jensen sobre probabilidades distintas). Por eso sobreestima la cobertura "al azar" y sesga la lectura
hacia "persistencia".

Por qué no bootstrap por bloques de 12 meses: un bloque de 12 meses conserva la autocorrelación dentro del
bloque, que es justamente lo que miden VR(3), VR(6) y VR(12); el null reproduciría el VR observado y no
tendría poder. Permutar años dentro del mes calendario conserva la estacionalidad sin conservar la memoria.

Consecuencia para la lectura: "persistencia" significa persistencia más allá de la deriva media de cada
rubro en toda la muestra. Una deriva constante de 10 años no cuenta como señal; un episodio (congelamiento
y después recomposición) sí.
"""

from __future__ import annotations

import warnings

import numpy as np

N_REPLICAS = 2000
SEMILLA = 20261113
LOTE = 100
PERCENTILES = (5, 50, 95)
EPS = 1e-9


def permutar_por_mes(R: np.ndarray, meses: np.ndarray, rng: np.random.Generator, B: int) -> np.ndarray:
    """B réplicas de R (T×N) con los años permutados dentro de cada mes calendario, ítem por ítem."""
    T, N = R.shape
    out = np.empty((B, T, N))
    for m in np.unique(meses):
        filas = np.flatnonzero(meses == m)
        orden = np.argsort(rng.random((B, filas.size, N)), axis=1)
        out[:, filas, :] = np.take_along_axis(np.broadcast_to(R[filas], (B, filas.size, N)), orden, axis=1)
    return out


def _wvar(X: np.ndarray, w: np.ndarray) -> np.ndarray:
    """Varianza ponderada en el último eje. X: (B, M, N); w: (M, N) con filas que suman 1 → (B, M)."""
    m = np.sum(w * X, axis=-1, keepdims=True)
    return np.sum(w * (X - m) ** 2, axis=-1)


def c_y_vr(Rb: np.ndarray, W: np.ndarray, ks) -> tuple[dict[int, np.ndarray], dict[int, np.ndarray]]:
    """
    C_t(k) y VR_t(k) para un lote de paneles Rb (B×T×N) con ponderadores W (T×N).
    Mismas definiciones que `difusion.metricas`: ventana t−k+1…t, pesos del inicio de la ventana.
    """
    B, T, N = Rb.shape
    sobre = (Rb > EPS).astype(np.int32)
    cs = np.concatenate([np.zeros((B, 1, N)), np.cumsum(Rb, axis=1)], axis=1)
    cs_s = np.concatenate([np.zeros((B, 1, N), dtype=np.int32), np.cumsum(sobre, axis=1)], axis=1)
    C, VR = {}, {}
    for k in ks:
        n = T - k + 1
        ws = W[:n]  # pesos del inicio de cada ventana
        win = cs[:, k:] - cs[:, :-k]  # Σ r en la ventana que termina en t = k−1…T−1
        num = _wvar(win, ws)
        den = sum(_wvar(Rb[:, j : j + n], ws) for j in range(k))
        vr = np.full((B, T), np.nan)
        with np.errstate(invalid="ignore", divide="ignore"):
            vr[:, k - 1 :] = np.where(den > EPS**2, num / den, np.nan)
        alguna = (cs_s[:, k:] - cs_s[:, :-k]) > 0
        c = np.full((B, T), np.nan)
        c[:, k - 1 :] = 100 * np.sum(ws * alguna, axis=-1)
        C[k], VR[k] = c, vr
    return C, VR


def null_permutacion(
    R: np.ndarray, W: np.ndarray, meses: np.ndarray, ks, n: int = N_REPLICAS, semilla: int = SEMILLA, lote: int = LOTE
) -> dict[str, dict[int, np.ndarray]]:
    """
    Percentiles (5, 50, 95) por mes de C(k) y VR(k) bajo el null. Devuelve
    {"C": {k: array 3×T}, "VR": {k: array 3×T}} (filas = p5, p50, p95; NaN donde no hay ventana completa).
    """
    T, N = R.shape
    if np.isnan(R).any():
        raise ValueError("null_permutacion: R con faltantes")
    rng = np.random.default_rng(semilla)
    acc_c: dict[int, list[np.ndarray]] = {k: [] for k in ks}
    acc_v: dict[int, list[np.ndarray]] = {k: [] for k in ks}
    hechas = 0
    while hechas < n:
        b = min(lote, n - hechas)
        Rb = permutar_por_mes(R, meses, rng, b)
        C, VR = c_y_vr(Rb, W, ks)
        for k in ks:
            acc_c[k].append(C[k])
            acc_v[k].append(VR[k])
        hechas += b
    out: dict[str, dict[int, np.ndarray]] = {"C": {}, "VR": {}}
    for k in ks:
        for clave, acc in (("C", acc_c), ("VR", acc_v)):
            x = np.concatenate(acc[k], axis=0)
            with warnings.catch_warnings():  # columnas sin ventana completa (t < k−1): todo NaN, se informa NaN
                warnings.simplefilter("ignore", RuntimeWarning)
                out[clave][k] = np.nanpercentile(x, PERCENTILES, axis=0)
    return out
