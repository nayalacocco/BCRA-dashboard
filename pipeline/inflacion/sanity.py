"""
Sanity check de difusión contra el gráfico de Banco Galicia ("Difusión de la Inflación, % del total de precios").

Hipótesis (inferida, no documentada por Galicia): 27 aperturas comunes a las 6 regiones, agregadas a nivel
nacional y contadas SIN ponderar. Indicio: las barras se mueven en escalones de ≈3,7 % = 1/27.

Se reportan los buckets de π m/m (<0, 0–0,5, 0,5–1, …, 4–5, >5) en tres variantes:
  A) 27 aperturas nacionales, sin ponderar   (comparable con Galicia)
  B) 27 aperturas nacionales, ponderadas
  C) 218 ítems (apertura×región + residuales), ponderados   (la métrica del dashboard)
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .indec import PESO_REGION_NORM, REGIONES
from .items import Item, pesos_efectivos, variaciones

CORTES = [-np.inf, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, np.inf]
ETIQUETAS = ["<0", "0-0,5", "0,5-1", "1-1,5", "1,5-2", "2-2,5", "2,5-3", "3-3,5", "3,5-4", "4-5", ">5"]


def aperturas_nacionales(items: list[Item], panel: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    pub = [i for i in items if not i.residual]
    comunes = sorted(set.intersection(*[{i.codigo for i in pub if i.region == r} for r in REGIONES]))
    cols, pesos = {}, {}
    for c in comunes:
        sub = [i for i in pub if i.codigo == c]
        w = np.array([i.peso_nacional for i in sub])
        cols[c] = sum(wi * panel[i.id] for wi, i in zip(w, sub)) / w.sum()
        pesos[c] = w.sum()
    return pd.DataFrame(cols), pd.Series(pesos)


def buckets(pi: pd.Series, w: pd.Series | None = None) -> pd.Series:
    cat = pd.cut(pi, CORTES, labels=ETIQUETAS, right=False)
    if w is None:
        return cat.value_counts(normalize=True).reindex(ETIQUETAS).fillna(0) * 100
    return (w.groupby(cat, observed=False).sum() / w.sum()).reindex(ETIQUETAS).fillna(0) * 100


def reporte(items: list[Item], panel: pd.DataFrame, meses: int = 8) -> str:
    nac, pesos_nac = aperturas_nacionales(items, panel)
    pi_nac = variaciones(nac)
    w_nac = pesos_efectivos([Item(c, "Nacional", c, c[:2], c, False, 0, float(pesos_nac[c])) for c in nac.columns], nac)
    pi_all = variaciones(panel)
    w_all = pesos_efectivos(items, panel)

    lineas = [f"Aperturas nacionales comunes: {len(nac.columns)} ({' '.join(nac.columns)})", ""]
    for f in pi_nac.index[-meses:]:
        a = buckets(pi_nac.loc[f])
        b = buckets(pi_nac.loc[f], w_nac.loc[f])
        c = buckets(pi_all.loc[f], w_all.loc[f])
        lineas.append(f"{f:%Y-%m}  <2% m/m →  A {a.iloc[:5].sum():5.1f}%   B {b.iloc[:5].sum():5.1f}%   C {c.iloc[:5].sum():5.1f}%")
        lineas.append("   A: " + "  ".join(f"{k}:{v:4.1f}" for k, v in a.items()))
    return "\n".join(lineas)
