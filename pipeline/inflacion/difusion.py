"""
M2 — Difusión y rotación de la inflación.

Notación
--------
π_{i,t}: variación m/m del ítem i. π_t: nivel general (headline). ω_{i,t}: ponderador efectivo (suma 1).
r_{i,t} = ln(1+π_{i,t}) − ln(1+π_t): cambio de precio relativo.
Ventana de k meses que termina en t: meses t−k+1 … t. En toda métrica de ventana se usan los ponderadores
del inicio de la ventana, ω_{i,t−k+1} ∝ ω_i · I_{i,t−k}: con ellos Π_t(k) = Σ_i ω · Π_{i,t}(k) vale exacto
para un índice de base fija.

Métricas
--------
D_t        % (ponderado o no) de ítems con π_{i,t} > π_t.
buckets    distribución de π_{i,t} − π_t en tramos (pp respecto del nivel general). Los tramos > 0 suman D_t.
C_t(k)     % de ítems que superaron al nivel general en al menos un mes de la ventana.
C*_t(k)    aproximación descartada: 1 − Π_j (1 − D_{t−j}) (supone ítems homogéneos; sobreestima la cobertura al
           azar). Se exporta solo para documentarla. La referencia es el null por permutación (`nulo.py`).
nulo       percentiles 5/50/95 de C_t(k) y VR_t(k) permutando años dentro de cada mes calendario, ítem por ítem.
A_t(k)     % de ítems con acumulada Π_{i,t}(k) > Π_t(k).
VR_t(k)    Var_cs(Σ_j r_{i,t−j}) / (k · media_j Var_cs(r_{i,t−j})).
           Identidad: VR − 1 = 2·Σ_{j<l} Cov_cs(r_j, r_l) / Σ_j Var_cs(r_j), es decir, la autocovarianza
           cross-section de los precios relativos dentro de la ventana, normalizada.
ρ_t        correlación cross-section ponderada entre r_{i,t} y r_{i,t−1}.

En la versión "sin ponderar" todos los ítems pesan 1/N (el nivel general de comparación es siempre el
ponderado de la canasta completa).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import nulo as _nulo

KS = (3, 6, 12)
# Tramos de π_i − π_t en puntos porcentuales. Intervalos (a, b]: un ítem igual al nivel general cae en "−0,5 a 0".
CORTES = [-np.inf, -2, -1, -0.5, 0, 0.5, 1, 2, np.inf]
ETIQUETAS = ["< −2", "−2 a −1", "−1 a −0,5", "−0,5 a 0", "0 a 0,5", "0,5 a 1", "1 a 2", "> 2"]
N_DEBAJO = 4  # los primeros 4 tramos: el ítem no supera al nivel general
EPS = 1e-9
N_PERMUTACIONES = 300  # réplicas de inversión de signos para las bandas de VR
SEMILLA = 20261113


def indice_agregado(panel: pd.DataFrame, w_base: pd.Series) -> pd.Series:
    """Índice de base fija: I_t = Σ ω_i I_{i,t} / Σ ω_i."""
    w = w_base.reindex(panel.columns)
    return panel.mul(w, axis=1).sum(axis=1) / w.sum()


def pesos_efectivos(panel: pd.DataFrame, w_base: pd.Series | None) -> pd.DataFrame:
    """ω_{i,t} ∝ ω_i · I_{i,t−1}. Si w_base es None: 1/N."""
    if w_base is None:
        return pd.DataFrame(1.0 / panel.shape[1], index=panel.index, columns=panel.columns)
    raw = panel.shift(1).mul(w_base.reindex(panel.columns), axis=1)
    return raw.div(raw.sum(axis=1), axis=0)


def _wvar(x: np.ndarray, w: np.ndarray) -> float:
    m = np.sum(w * x)
    return float(np.sum(w * (x - m) ** 2))


def _wcorr(x: np.ndarray, y: np.ndarray, w: np.ndarray) -> float:
    mx, my = np.sum(w * x), np.sum(w * y)
    vx, vy = np.sum(w * (x - mx) ** 2), np.sum(w * (y - my) ** 2)
    if vx < EPS**2 or vy < EPS**2:
        return np.nan
    return float(np.sum(w * (x - mx) * (y - my)) / np.sqrt(vx * vy))


def vr_serie(R: np.ndarray, W: np.ndarray, k: int) -> np.ndarray:
    """VR_t(k) para cada t. R: T×N de r_{i,t}; W: T×N de ponderadores (fila t = ω_{·,t})."""
    T = R.shape[0]
    out = np.full(T, np.nan)
    for t in range(k - 1, T):
        blk = R[t - k + 1 : t + 1]
        if np.isnan(blk).any():
            continue
        w = W[t - k + 1]
        den = k * np.mean([_wvar(blk[j], w) for j in range(k)])
        if den < EPS**2:
            continue
        out[t] = _wvar(blk.sum(axis=0), w) / den
    return out


def bandas_vr(R: np.ndarray, w: np.ndarray, ks=KS, n=N_PERMUTACIONES, semilla=SEMILLA) -> dict[int, tuple[float, float]]:
    """
    Bandas de referencia de VR bajo la hipótesis "los cambios de precios relativos no tienen memoria":
    se invierte al azar el signo de cada r_{i,t} (n réplicas) y se toman los percentiles 5 y 95 de VR(k)
    sobre todas las ventanas y réplicas.

    Por qué inversión de signos y no permutar meses: permutar el orden temporal de cada ítem conserva su
    deriva media (un ítem que sube siempre más que el resto sigue haciéndolo en cualquier orden), así que
    la banda quedaría centrada en el propio VR observado. Invertir signos elimina tanto la autocorrelación
    como la deriva, y conserva la magnitud de cada movimiento (volatilidad por ítem y por época). Bajo esta
    hipótesis E[VR] = 1.
    """
    rng = np.random.default_rng(semilla)
    R = R[~np.isnan(R).any(axis=1)]
    T, N = R.shape
    Wc = np.tile(w / w.sum(), (max(T, 1), 1))
    acc: dict[int, list[np.ndarray]] = {k: [] for k in ks}
    for _ in range(n):
        Rp = R * rng.choice([-1.0, 1.0], size=R.shape)
        for k in ks:
            v = vr_serie(Rp, Wc, k)
            acc[k].append(v[~np.isnan(v)])
    out = {}
    for k, v in acc.items():
        x = np.concatenate(v) if v else np.array([])
        out[k] = (float(np.percentile(x, 5)), float(np.percentile(x, 95))) if x.size else (np.nan, np.nan)
    return out


def metricas(panel: pd.DataFrame, w_base: pd.Series | None, headline: pd.Series, ks=KS, replicas: int | None = None) -> dict:
    """
    panel: índices de los ítems del universo. w_base: ponderadores de base (None = sin ponderar).
    headline: índice del nivel general de la canasta completa (misma variante: original o desest.).
    Devuelve series alineadas a panel.index[1:].
    """
    idx = panel.index[1:]
    pi = (panel / panel.shift(1) - 1.0).iloc[1:]
    pih = (headline / headline.shift(1) - 1.0).reindex(panel.index).iloc[1:]
    W = pesos_efectivos(panel, w_base).iloc[1:]
    PI, PH, Wm = pi.values, pih.values, W.values
    T, N = PI.shape
    R = np.log1p(PI) - np.log1p(PH)[:, None]
    sobre = PI > (PH[:, None] + EPS)

    # D_t y buckets
    D = np.full(T, np.nan)
    buckets = np.zeros((T, len(ETIQUETAS)))
    for t in range(T):
        w = Wm[t]
        if np.sqrt(_wvar(PI[t], w)) < EPS:  # todos iguales: "por encima del promedio" no está definido
            pass
        else:
            D[t] = 100 * np.sum(w[sobre[t]])
        cat = np.digitize((PI[t] - PH[t] - EPS) * 100, CORTES[1:-1], right=True)
        buckets[t] = 100 * np.bincount(cat, weights=w, minlength=len(ETIQUETAS))

    out: dict = {"D": D, "buckets": buckets, "C": {}, "Cref": {}, "A": {}, "VR": {}}
    IDX = panel.values  # incluye la fila 0 (base de la primera variación)
    H = headline.reindex(panel.index).values
    for k in ks:
        C = np.full(T, np.nan)
        Cref = np.full(T, np.nan)
        A = np.full(T, np.nan)
        for t in range(k - 1, T):
            w = Wm[t - k + 1]
            C[t] = 100 * np.sum(w[sobre[t - k + 1 : t + 1].any(axis=0)])
            d = D[t - k + 1 : t + 1]
            if not np.isnan(d).any():
                Cref[t] = 100 * (1 - np.prod(1 - d / 100))
            # acumulada: fila t de pi ↔ fila t+1 de IDX
            acum_i = IDX[t + 1] / IDX[t + 1 - k] - 1
            acum_h = H[t + 1] / H[t + 1 - k] - 1
            if np.sqrt(_wvar(acum_i, w)) >= EPS:
                A[t] = 100 * np.sum(w[acum_i > acum_h + EPS])
        out["C"][k], out["Cref"][k], out["A"][k] = C, Cref, A
        out["VR"][k] = vr_serie(R, Wm, k)

    rho = np.full(T, np.nan)
    for t in range(1, T):
        rho[t] = _wcorr(R[t], R[t - 1], Wm[t - 1])
    out["rho"] = rho
    s = pd.Series(rho, index=idx)
    out["rho6"] = s.rolling(6, min_periods=6).mean().values
    out["rho12"] = s.rolling(12, min_periods=12).mean().values

    w_medio = np.nanmean(Wm, axis=0)
    out["VRbanda"] = bandas_vr(R, w_medio, ks, n=50)  # null anterior (inversión de signos); solo referencia
    meses = np.asarray(idx.month) - 1 if hasattr(idx, "month") else np.arange(T) % 12
    out["nulo"] = _nulo.null_permutacion(R, Wm, meses, ks, n=replicas or _nulo.N_REPLICAS)
    out["R"] = pd.DataFrame(R, index=idx, columns=panel.columns)
    out["fechas"] = idx
    return out


# ---------------------------------------------------------------------------
# Régimen: reglas explícitas sobre D (amplitud), VR(3) y C(3) (rotación)
# ---------------------------------------------------------------------------

# Amplitud: terciles de la distribución histórica de D̄ (3 meses) de cada variante. D cae estructuralmente
# bajo 50 % porque la distribución de variaciones es asimétrica a la derecha (pocos rubros con subas grandes
# tiran el promedio para arriba), así que un umbral fijo en torno a 50 % no es neutro.
TERCILES = (100 / 3, 200 / 3)


def umbrales_amplitud(d3: np.ndarray) -> tuple[float, float]:
    x = np.asarray(d3, dtype=float)
    x = x[np.isfinite(x)]
    if x.size < 12:
        return (np.nan, np.nan)
    lo, hi = np.percentile(x, TERCILES)
    return (float(lo), float(hi))

REGIMENES = {
    "generalizada_escalonada": {
        "titulo": "Generalizada y escalonada (inercia)",
        "texto": "Cerca de la mitad de la canasta sube por encima del promedio y los rubros se turnan: los precios relativos revierten dentro del trimestre. Patrón típico de inercia, sin un shock dominante.",
    },
    "generalizada_persistente": {
        "titulo": "Generalizada con cambio persistente de precios relativos",
        "texto": "La suba es amplia, pero los mismos rubros lideran mes a mes: hay un realineamiento de precios relativos en curso, además de la inercia.",
    },
    "concentrada_persistente": {
        "titulo": "Shock de precios relativos concentrado y persistente",
        "texto": "Pocos rubros explican la suba y siguen liderando: cambio de precios relativos concentrado (regulados, tipo de cambio, un rubro puntual) que todavía no se agota.",
    },
    "concentrada_transitoria": {
        "titulo": "Shock concentrado que revierte",
        "texto": "Pocos rubros empujaron el nivel general, pero sus precios relativos revierten dentro del trimestre: shock puntual (estacionales, un ajuste regulado) más que cambio de régimen.",
    },
    "intermedia": {
        "titulo": "Sin señal clara",
        "texto": "Amplitud intermedia o precios relativos sin patrón distinguible del ruido: no hay evidencia suficiente para clasificar el mes.",
    },
}


AMPLITUD = {
    "concentrada": "Concentrada: difusión en el tercio inferior de su historia",
    "intermedia": "Intermedia: difusión en el tercio central de su historia",
    "generalizada": "Generalizada: difusión en el tercio superior de su historia",
}
DINAMICA = {
    "rotacion": "Rotación: los rubros se turnan más de lo que daría el azar",
    "ruido": "Sin patrón distinguible del azar",
    "persistencia": "Persistencia: los mismos rubros siguen liderando más de lo que daría el azar",
}


def componentes(
    d3: float, vr3: float, c3: float, umbrales: tuple[float, float], vr_null: tuple[float, float], c_null: tuple[float, float]
) -> tuple[str | None, str | None]:
    """
    Amplitud (sobre D̄, promedio de 3 meses de D, contra los terciles históricos de la variante):
        concentrada ⇔ D̄ < p33      generalizada ⇔ D̄ ≥ p67      intermedia en el medio
    Dinámica (contra el null por permutación del mes; vr_null y c_null = (p5, p95)):
        persistencia ⇔ VR(3) > p95 o C(3) < p5    (los mismos rubros, más de lo que daría el azar)
        rotación     ⇔ VR(3) < p5  o C(3) > p95   (se turnan más de lo que daría el azar)
        ruido        si no sale de ninguna banda, o si las dos señales se contradicen
    """
    if any(np.isnan(x) for x in (d3, vr3, c3, *umbrales, *vr_null, *c_null)):
        return None, None
    lo, hi = umbrales
    amp = "generalizada" if d3 >= hi else "concentrada" if d3 < lo else "intermedia"
    pers = vr3 > vr_null[1] or c3 < c_null[0]
    rot = vr3 < vr_null[0] or c3 > c_null[1]
    din = "persistencia" if pers and not rot else "rotacion" if rot and not pers else "ruido"
    return amp, din


_TABLA = {
    ("generalizada", "rotacion"): "generalizada_escalonada",
    ("generalizada", "persistencia"): "generalizada_persistente",
    ("concentrada", "persistencia"): "concentrada_persistente",
    ("concentrada", "rotacion"): "concentrada_transitoria",
}


def clasificar(d3, vr3, c3, umbrales, vr_null, c_null) -> str:
    """Régimen = combinación de amplitud y dinámica (ver `componentes`); el resto es "intermedia"."""
    return _TABLA.get(componentes(d3, vr3, c3, umbrales, vr_null, c_null), "intermedia")


def regimen(m: dict) -> dict:
    D = pd.Series(m["D"])
    d3 = D.rolling(3, min_periods=3).mean().values
    umb = umbrales_amplitud(d3)
    nv, nc = m["nulo"]["VR"][3], m["nulo"]["C"][3]
    comp = [
        componentes(d3[t], m["VR"][3][t], m["C"][3][t], umb, (nv[0][t], nv[2][t]), (nc[0][t], nc[2][t]))
        for t in range(len(D))
    ]
    return {
        "D3": d3,
        "excesoC3": m["C"][3] - nc[1],
        "umbrales": umb,
        "amplitud": [c[0] for c in comp],
        "dinamica": [c[1] for c in comp],
        "codigo": [_TABLA.get(c, "intermedia") for c in comp],
    }
