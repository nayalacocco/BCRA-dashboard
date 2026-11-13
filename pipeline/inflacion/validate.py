"""
Validaciones del pipeline. Las marcadas como bloqueantes impiden publicar datos nuevos.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd

from .indec import PESO_REGION, REGIONES
from .items import Item, pesos_efectivos, variaciones

# Tolerancia de reconciliación (pp de variación m/m). INDEC publica con 1 decimal.
TOL_NACIONAL_PP = 0.05
TOL_REGION_PP = 0.10
# Desde cuándo se exige la tolerancia (los primeros meses de la serie tienen ajustes de base)
RECON_DESDE = "2017-01-01"


@dataclass
class Check:
    nombre: str
    ok: bool
    bloqueante: bool
    detalle: str
    datos: dict = field(default_factory=dict)


def check_ponderadores(pond: pd.DataFrame) -> Check:
    malos = {}
    for r in REGIONES:
        sub = pond[(pond.region == r) & (pond.codigo.str.fullmatch(r"\d{2}"))]
        s = float(sub.peso.sum())
        if abs(s - 1.0) > 0.002:
            malos[r] = round(s, 4)
    s_reg = sum(PESO_REGION.values())
    ok = not malos and abs(s_reg - 1.0) < 0.002
    det = "Divisiones suman 1 en cada región y regiones suman 1" if ok else f"Sumas fuera de tolerancia: {malos}, regiones={s_reg:.4f}"
    return Check("ponderadores_suman_1", ok, True, det, {"regiones": malos, "suma_regiones": s_reg})


def check_fechas(divisiones: pd.DataFrame, aperturas: pd.DataFrame, panel: pd.DataFrame) -> Check:
    f_div = divisiones.fecha.max()
    f_ap = aperturas.fecha.max()
    esperado = pd.date_range(panel.index.min(), panel.index.max(), freq="MS")
    huecos = sorted(set(esperado) - set(panel.index))
    nan_cols = [c for c in panel.columns if panel[c].isna().any()]
    ok = f_div == f_ap and not huecos and not nan_cols
    det = (
        f"Último período divisiones={f_div:%Y-%m}, aperturas={f_ap:%Y-%m}; "
        f"huecos={len(huecos)}; ítems con faltantes={len(nan_cols)}"
    )
    return Check(
        "fechas_alineadas_sin_huecos", ok, True, det,
        {"ultimo_divisiones": f"{f_div:%Y-%m}", "ultimo_aperturas": f"{f_ap:%Y-%m}",
         "huecos": [f"{h:%Y-%m}" for h in huecos], "items_con_faltantes": nan_cols[:20]},
    )


def reconciliacion(items: list[Item], panel: pd.DataFrame, divisiones: pd.DataFrame) -> tuple[Check, pd.DataFrame]:
    """
    Headline m/m recomputado desde ítems × ponderadores efectivos vs. publicado por INDEC,
    para el Nacional y cada región.
    """
    pi = variaciones(panel)
    filas = []
    for scope in ["Nacional"] + REGIONES:
        its = items if scope == "Nacional" else [i for i in items if i.region == scope]
        ids = [i.id for i in its]
        w = pesos_efectivos(its, panel[ids])
        recomp = (w * pi[ids]).sum(axis=1, min_count=1)
        pub = divisiones[
            (divisiones.region == scope) & (divisiones.codigo == "0")
            & (divisiones.clasificador == "Nivel general y divisiones COICOP")
        ].set_index("fecha")["indice"].sort_index()
        pub_vm = (pub / pub.shift(1) - 1) * 100
        df = pd.DataFrame({"publicado": pub_vm, "recomputado": recomp}).dropna()
        df["desvio_pp"] = df.recomputado - df.publicado
        df["scope"] = scope
        filas.append(df.reset_index().rename(columns={"index": "fecha"}))
    rec = pd.concat(filas, ignore_index=True)

    eval_ = rec[rec.fecha >= RECON_DESDE]
    nac = eval_[eval_.scope == "Nacional"].desvio_pp.abs()
    reg = eval_[eval_.scope != "Nacional"].desvio_pp.abs()
    ok = bool(nac.max() <= TOL_NACIONAL_PP and reg.max() <= TOL_REGION_PP)
    resumen = {
        "tol_nacional_pp": TOL_NACIONAL_PP,
        "tol_region_pp": TOL_REGION_PP,
        "nacional_max_abs_pp": round(float(nac.max()), 4),
        "nacional_mediana_abs_pp": round(float(nac.median()), 4),
        "regiones_max_abs_pp": round(float(reg.max()), 4),
        "meses_fuera_tol_nacional": [f"{f:%Y-%m}" for f in eval_[(eval_.scope == "Nacional") & (eval_.desvio_pp.abs() > TOL_NACIONAL_PP)].fecha],
    }
    det = (
        f"Nacional: desvío máx {resumen['nacional_max_abs_pp']} pp, mediana {resumen['nacional_mediana_abs_pp']} pp "
        f"(tol {TOL_NACIONAL_PP}); regiones máx {resumen['regiones_max_abs_pp']} pp (tol {TOL_REGION_PP})"
    )
    return Check("reconciliacion_headline", ok, True, det, resumen), rec


def check_outliers(panel: pd.DataFrame, z: float = 4.0) -> Check:
    """Marca (no bloquea) variaciones con |z| > 4 dentro de la serie de cada ítem (z robusto, MAD)."""
    pi = variaciones(panel).iloc[1:]
    med = pi.median()
    mad = (pi - med).abs().median() * 1.4826
    zs = (pi - med) / mad.replace(0, np.nan)
    hits = zs.abs() > z
    lista = [
        {"item": c, "fecha": f"{f:%Y-%m}", "pi": round(float(pi.at[f, c]), 2)}
        for c in pi.columns for f in pi.index[hits[c].fillna(False)]
    ]
    ultimo = pi.index.max()
    recientes = [x for x in lista if x["fecha"] == f"{ultimo:%Y-%m}"]
    return Check("outliers", True, False, f"{len(lista)} observaciones con |z|>{z}; {len(recientes)} en el último mes", {"ultimo_mes": recientes})


def to_dict(c: Check) -> dict:
    return asdict(c)
