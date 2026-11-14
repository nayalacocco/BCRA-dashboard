"""
Precios relativos con anclas (M2 · nivel vs. dirección).

Nivel relativo de cada ítem (en log, desestacionalizado):
    L_{i,t} = ln(I_{i,t} / I_{i,dic-16}) − ln(H_t / H_dic-16)
I = índice del ítem, H = nivel general (canasta completa). Ambos valen 100 en dic-2016, así que L no
depende de una "fecha base" elegida: el problema de la columna «Acum.» era que el desvío cambiaba según
desde dónde se acumulara.

Anclas (jerarquía; cada ítem declara cuál usa):
  1. Externa o de costo — no se usa: ver «Inventario de anclas» en docs/inflacion/metodologia-difusion.md.
     Las candidatas (CAMMESA, PIST, ICP 2021, alquileres CABA) no tienen serie oficial descargable, mezclan
     rubros (INDEC publica electricidad y gas juntos) o están medidas con un tipo de cambio distorsionado.
  2. Historia filtrada por régimen: promedio de L en los meses sin restricciones cambiarias (cepo).
     Regla oficial y verificable: sin cepo = ene-2017…ago-2019 (fin: Com. A 6770, 1/9/2019) y
     desde abr-2025 (fin del cepo para personas humanas, 14/4/2025).
  3. Promedio simple de toda la muestra: solo referencia (contaminado por congelamientos y cepo).

Desvío vs. ancla: exp(L_T − ancla) − 1. Dirección: exp(L_T − L_{T−k}) − 1, k = 3, 6, 12 (no depende del ancla).

Backtest ("¿sirve para estimar?"): para las 27 aperturas nacionales, con anclas calculadas solo con datos
hasta t (sin mirar el futuro), se regresa el cambio del precio relativo en los 6 meses siguientes contra el
desvío en t. β < 0 = el desvío tiende a corregirse. Se usan orígenes cada 6 meses (sin superposición).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

KS_DIR = (3, 6, 12)
HORIZONTE = 6
INICIO_BACKTEST = "2019-01"

# Meses sin cepo (inclusive). Fuentes: BCRA Com. A 6770 (1/9/2019); fin del cepo para personas humanas 14/4/2025.
SIN_CEPO = [("2017-01", "2019-08"), ("2025-04", None)]


def meses_sin_cepo(fechas: pd.DatetimeIndex) -> np.ndarray:
    f = pd.Index([f"{x:%Y-%m}" for x in fechas])
    m = np.zeros(len(f), dtype=bool)
    for a, b in SIN_CEPO:
        m |= (f >= a) & ((f <= b) if b else True)
    return m


def nivel_relativo(panel: pd.DataFrame, headline: pd.Series) -> pd.DataFrame:
    """L_{i,t} en log (fila 0 = dic-2016 → 0)."""
    Li = np.log(panel / panel.iloc[0])
    Lh = np.log(headline / headline.iloc[0])
    return Li.sub(Lh, axis=0)


def anclas(L: pd.DataFrame, hasta: int | None = None) -> tuple[pd.Series, pd.Series]:
    """(ancla filtrada, ancla simple) con datos hasta la fila `hasta` inclusive (None = toda la muestra)."""
    X = L if hasta is None else L.iloc[: hasta + 1]
    m = meses_sin_cepo(X.index)
    return X[m].mean(), X.mean()


def resumen_items(L: pd.DataFrame) -> pd.DataFrame:
    """Desvíos vs. anclas y dirección en el último mes, por ítem (en %)."""
    af, as_ = anclas(L)
    T = len(L) - 1
    out = pd.DataFrame(
        {
            "ancla": "historia_filtrada",
            "desvio_filtrada": 100 * (np.exp(L.iloc[T] - af) - 1),
            "desvio_simple": 100 * (np.exp(L.iloc[T] - as_) - 1),
        }
    )
    for k in KS_DIR:
        out[f"d{k}"] = 100 * (np.exp(L.iloc[T] - L.iloc[T - k]) - 1)
    return out


def backtest(L: pd.DataFrame, horizonte: int = HORIZONTE, inicio: str = INICIO_BACKTEST) -> dict:
    """
    Regresión agrupada (pooled) del cambio futuro del precio relativo contra el desvío vs. ancla en t, con
    anclas calculadas con datos ≤ t. Compara ancla filtrada, ancla simple y la dirección pasada (momentum).
    """
    fechas = [f"{x:%Y-%m}" for x in L.index]
    t0 = fechas.index(inicio)
    origenes = list(range(t0, len(L) - horizonte, horizonte))
    filas = []
    for t in origenes:
        af, as_ = anclas(L, hasta=t)
        y = L.iloc[t + horizonte] - L.iloc[t]
        for c in L.columns:
            filas.append(
                {
                    "t": fechas[t],
                    "item": c,
                    "y": y[c],
                    "x_filtrada": L.iloc[t][c] - af[c],
                    "x_simple": L.iloc[t][c] - as_[c],
                    "x_momentum": L.iloc[t][c] - L.iloc[t - horizonte][c],
                }
            )
    df = pd.DataFrame(filas).dropna()

    def ols(x: str) -> dict:
        X = np.column_stack([np.ones(len(df)), df[x].values])
        yv = df["y"].values
        beta, *_ = np.linalg.lstsq(X, yv, rcond=None)
        res = yv - X @ beta
        r2 = 1 - res.var() / yv.var()
        # error estándar agrupado por fecha de origen (los ítems de un mismo semestre comparten el shock)
        XtX_inv = np.linalg.inv(X.T @ X)
        meat = np.zeros((2, 2))
        for _, g in df.assign(res=res).groupby("t"):
            Xg = np.column_stack([np.ones(len(g)), g[x].values])
            s = Xg.T @ g["res"].values
            meat += np.outer(s, s)
        G = df["t"].nunique()
        V = XtX_inv @ meat @ XtX_inv * G / max(G - 1, 1)
        se = float(np.sqrt(V[1, 1]))
        acierto = float(np.mean(np.sign(df["y"]) == -np.sign(df[x]))) if x != "x_momentum" else float(np.mean(np.sign(df["y"]) == np.sign(df[x])))
        vida_media = float(np.log(0.5) / np.log(1 + beta[1]) * horizonte) if -1 < beta[1] < 0 else None
        return {
            "beta": float(beta[1]),
            "se": se,
            "t": float(beta[1] / se) if se > 0 else None,
            "r2": float(r2),
            "acierto_signo": acierto,
            "vida_media_meses": vida_media,
        }

    return {
        "horizonte_meses": horizonte,
        "origenes": [fechas[t] for t in origenes],
        "n_obs": int(len(df)),
        "n_items": int(df["item"].nunique()),
        "filtrada": ols("x_filtrada"),
        "simple": ols("x_simple"),
        "momentum": ols("x_momentum"),
    }
