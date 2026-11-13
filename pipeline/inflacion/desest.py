"""
Desestacionalización de los índices por ítem.

Método
------
STL robusto (Cleveland et al., 1990) sobre la variación logarítmica mensual, Δln I_{i,t}, con período 12
y suavizado estacional de 7 años (estacionalidad que puede evolucionar).

Por qué sobre Δln y no sobre ln I: la serie arranca en dic-2016 y contiene un salto de nivel de régimen
(dic-2023, +25 % m/m). En niveles, el suavizador de tendencia no puede seguir el escalón y el residuo
contamina el componente estacional durante meses; en variaciones, el mismo episodio es un outlier de pocos
meses que la versión robusta de STL pondera a cero. Un componente estacional aditivo en ln I equivale a un
componente estacional aditivo (y periódico) en Δln I, así que la descomposición es equivalente.

Filtro de estacionalidad identificable: solo se ajusta un ítem si un test de Kruskal–Wallis por mes
calendario sobre la serie sin tendencia rechaza "no hay estacionalidad" con p < 0,01 (análogo al test de
estacionalidad estable de X-13). Ajustar series no estacionales solo agrega ruido.

Limitaciones
------------
- Con inflación alta, la amplitud estacional escala con el nivel de inflación (p. ej. ajustes anuales de
  cuotas). El suavizado de 7 años lo absorbe solo en parte.
- El componente estacional se normaliza para sumar ≈ 0 en cada año móvil (sin deriva de nivel).
- Las series desestacionalizadas se revisan con cada dato nuevo, sobre todo en los últimos meses.
- Alternativa descartada por ahora: X-13ARIMA-SEATS (requiere binario externo y especificación por serie con
  outliers de régimen). Se puede evaluar en F3.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import kruskal
from statsmodels.tsa.seasonal import STL

P_ESTACIONAL = 0.01
VENTANA_ESTACIONAL = 7


def normalizar_estacional(s: np.ndarray) -> np.ndarray:
    """
    Resta a cada mes el promedio del componente estacional en la ventana de 12 meses que lo contiene
    (centrada; en los extremos, la ventana completa más cercana). Así el componente suma ≈ 0 en cualquier
    año móvil y la serie desestacionalizada no se despega del nivel de la original (análogo a la
    normalización de factores estacionales de X-11).
    """
    n = len(s)
    out = np.empty(n)
    for t in range(n):
        a = min(max(t - 5, 0), max(n - 12, 0))
        out[t] = s[t] - s[a : a + 12].mean()
    return out


def ajustar_serie(indice: pd.Series) -> tuple[pd.Series, float, bool]:
    """Devuelve (índice desestacionalizado, p-valor del test, ajustado?)."""
    dlog = np.log(indice).diff().dropna()
    if len(dlog) < 36 or dlog.std() == 0:
        return indice.copy(), 1.0, False
    res = STL(dlog, period=12, seasonal=VENTANA_ESTACIONAL, robust=True).fit()
    sin_tendencia = dlog - res.trend
    grupos = [sin_tendencia[sin_tendencia.index.month == m].values for m in range(1, 13)]
    try:
        p = float(kruskal(*grupos).pvalue)
    except ValueError:
        p = 1.0
    if not (p < P_ESTACIONAL):
        return indice.copy(), p, False
    dlog_sa = dlog - normalizar_estacional(res.seasonal.values)
    sa = indice.copy()
    sa.iloc[1:] = indice.iloc[0] * np.exp(dlog_sa.cumsum().values)
    return sa, p, True


def desestacionalizar(panel: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, dict]]:
    out, info = {}, {}
    for c in panel.columns:
        sa, p, adj = ajustar_serie(panel[c])
        out[c] = sa
        info[c] = {"p_kruskal": round(p, 5), "ajustado": adj}
    return pd.DataFrame(out, index=panel.index), info
