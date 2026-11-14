"""
Construcción del panel de ítems (apertura × región) con canasta cerrada.

Definiciones
------------
- Ítem publicado: hoja del árbol de aperturas de INDEC en una región (p. ej. GBA:01.1.2 Carnes).
- Ítem residual "resto de la división d en la región r": lo que la división tiene y las aperturas
  publicadas no cubren. Su índice se deriva suponiendo que el índice de la división es un promedio
  ponderado (Laspeyres, base dic-2016) de sus componentes con los ponderadores de base:

      I_{d,t} = Σ_i (w_i / w_d) · I_{i,t}      con I_{·,dic-16} = 100

  ⇒  I_{resto,t} = (w_d · I_{d,t} − Σ_{i cubiertos} w_i · I_{i,t}) / (w_d − Σ_{i cubiertos} w_i)

- Ponderador nacional de base: ω_i = W_r · w_{i|r}  (W_r = peso de la región).
- Ponderador efectivo en el mes t (para agregar variaciones m/m de un índice de base fija):

      ω_{i,t} = ω_i · I_{i,t−1} / Σ_j ω_j · I_{j,t−1}

  y entonces π_t = Σ_i ω_{i,t} · π_{i,t} reproduce exactamente la variación del agregado.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .indec import PESO_REGION_NORM, REGIONES


@dataclass
class Item:
    id: str
    region: str
    codigo: str
    division: str
    descripcion: str
    residual: bool
    peso_region: float  # w_{i|r}, fracción del gasto de la región
    peso_nacional: float  # W_r · w_{i|r}


# Si lo no cubierto por las aperturas es menor a este porcentaje del peso de la división, se considera
# redondeo de la tabla de ponderadores: no se crea residual y se reescalan los pesos cubiertos.
UMBRAL_RESIDUAL = 0.01


def division_of(code: str) -> str:
    return code.split(".")[0].zfill(2)


def _peso(pond: pd.DataFrame, region: str, code: str) -> float | None:
    """Peso de un código; si no está, sube al padre (p. ej. 06.4.1 → 06.4)."""
    sub = pond[pond.region == region]
    c = code
    while c:
        hit = sub.loc[sub.codigo == c, "peso"]
        if len(hit):
            return float(hit.iloc[0])
        if "." not in c:
            return None
        c = c.rsplit(".", 1)[0]
    return None


def leaves(codes: list[str]) -> list[str]:
    codes = [c for c in codes if c != "0"]
    return sorted(c for c in codes if not any(o != c and o.startswith(c + ".") for o in codes))


def imputar_con_division(s: pd.Series, idx_div: pd.Series) -> tuple[pd.Series, list[pd.Timestamp]]:
    """
    Completa meses sin dato con la variación de la división (criterio de imputación al agregado
    superior, como hace INDEC). Caso real: abr–jul 2020 (prendas, restaurantes) por la cuarentena.
    """
    s = s.reindex(idx_div.index).copy()
    faltan = list(s.index[s.isna()])
    for f in faltan:
        i = s.index.get_loc(f)
        if i == 0:
            continue
        prev = s.iloc[i - 1]
        s.iloc[i] = prev * idx_div.iloc[i] / idx_div.iloc[i - 1]
    return s, faltan


def build_panel(
    divisiones: pd.DataFrame, aperturas: pd.DataFrame, ponderadores: pd.DataFrame
) -> tuple[list[Item], pd.DataFrame, list[str]]:
    """
    Devuelve (items, panel de índices [fecha × item_id], advertencias).
    El panel arranca en dic-2016 (base = 100). Los meses imputados quedan en `IMPUTADOS`.
    """
    warnings: list[str] = []
    IMPUTADOS.clear()
    items: list[Item] = []
    cols: dict[str, pd.Series] = {}

    for r in REGIONES:
        ap = aperturas[aperturas.region == r]
        dv = divisiones[(divisiones.region == r) & (divisiones.clasificador == "Nivel general y divisiones COICOP")]
        codes = sorted(ap.codigo.unique())
        lv = leaves(codes)
        W = PESO_REGION_NORM[r]

        by_div: dict[str, list[str]] = {}
        for c in lv:
            by_div.setdefault(division_of(c), []).append(c)

        for d in sorted({division_of(c) for c in codes if c != "0"}):
            w_d = _peso(ponderadores, r, d)
            if w_d is None:
                warnings.append(f"{r}: sin ponderador para la división {d}")
                continue
            idx_d = dv[dv.codigo.str.zfill(2) == d].set_index("fecha")["indice"].sort_index()
            comps = []
            for c in by_div.get(d, []):
                w = _peso(ponderadores, r, c)
                if w is None or w <= 0:
                    warnings.append(f"{r}: apertura {c} sin ponderador; se omite")
                    continue
                s = ap[ap.codigo == c].set_index("fecha")["indice"].sort_index()
                s, faltan = imputar_con_division(s, idx_d)
                if faltan:
                    IMPUTADOS[f"{r}:{c}"] = [f"{f:%Y-%m}" for f in faltan]
                comps.append((c, w, s))
            covered = sum(w for _, w, _ in comps)
            resto = w_d - covered
            # Residuo de redondeo: se reescalan los pesos cubiertos al de la división
            escala = w_d / covered if comps and 0 < resto < UMBRAL_RESIDUAL * w_d else 1.0
            if escala != 1.0:
                resto = 0.0
            acc = pd.Series(0.0, index=idx_d.index)
            for c, w, s in comps:
                w = w * escala
                iid = f"{r}:{c}"
                cols[iid] = s
                desc = ap.loc[ap.codigo == c, "descripcion"].iloc[0]
                items.append(Item(iid, r, c, d, desc, False, w, W * w))
                acc = acc + w * s

            if resto > 1e-6:
                idx_res = (w_d * idx_d - acc) / resto
                iid = f"{r}:{d}.R"
                cols[iid] = idx_res
                desc_d = dv.loc[dv.codigo.str.zfill(2) == d, "descripcion"].iloc[0]
                items.append(Item(iid, r, f"{d}.R", d, f"Resto de {desc_d}", True, resto, W * resto))
                if (idx_res <= 0).any():
                    warnings.append(f"{iid}: índice residual ≤ 0 en algún mes (revisar ponderadores)")
            elif resto < -1e-4:
                warnings.append(f"{r}: aperturas de {d} pesan más que la división ({covered:.4f} > {w_d:.4f})")

    panel = pd.DataFrame(cols).sort_index()
    return items, panel, warnings


IMPUTADOS: dict[str, list[str]] = {}


def variaciones(panel: pd.DataFrame) -> pd.DataFrame:
    """π_{i,t} en % (m/m) a partir del panel de índices."""
    return (panel / panel.shift(1) - 1.0) * 100.0


def pesos_efectivos(items: list[Item], panel: pd.DataFrame) -> pd.DataFrame:
    """ω_{i,t}: ponderador de base actualizado por precios relativos al mes t−1. Filas suman 1."""
    base = pd.Series({it.id: it.peso_nacional for it in items})
    lag = panel.shift(1)
    raw = lag.mul(base, axis=1)
    return raw.div(raw.sum(axis=1), axis=0)
