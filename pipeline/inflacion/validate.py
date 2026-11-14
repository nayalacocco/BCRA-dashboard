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


def check_divisiones_cubiertas(items: list[Item], panel: pd.DataFrame, divisiones: pd.DataFrame) -> Check:
    """
    Prueba independiente de las aperturas: en divisiones sin ítem residual (las aperturas cubren todo),
    la suma ponderada de aperturas tiene que replicar el índice de la división publicado.
    (Donde hay residual la igualdad vale por construcción, así que no es un test.)
    """
    pi = variaciones(panel)
    filas = []
    for r in REGIONES:
        its = [i for i in items if i.region == r]
        divs_con_res = {i.division for i in its if i.residual}
        for d in sorted({i.division for i in its} - divs_con_res):
            sub = [i for i in its if i.division == d]
            if len(sub) < 2:
                continue  # una sola apertura = la división misma
            ids = [i.id for i in sub]
            w = pesos_efectivos(sub, panel[ids])
            rec = (w * pi[ids]).sum(axis=1, min_count=1)
            pub = divisiones[(divisiones.region == r) & (divisiones.codigo.str.zfill(2) == d)
                             & (divisiones.clasificador == "Nivel general y divisiones COICOP")].set_index("fecha")["indice"].sort_index()
            dev = (rec - (pub / pub.shift(1) - 1) * 100).dropna()
            dev = dev[dev.index >= RECON_DESDE]
            filas.append({"region": r, "division": d, "max_abs_pp": round(float(dev.abs().max()), 4), "mediana_abs_pp": round(float(dev.abs().median()), 4)})
    peor = max((f["max_abs_pp"] for f in filas), default=0.0)
    return Check("divisiones_cubiertas_por_aperturas", peor <= 0.15, False,
                 f"{len(filas)} divisiones×región cubiertas solo por aperturas; desvío máx {peor} pp (referencia 0,15)", {"detalle": filas})


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


def check_universo(items) -> Check:
    """
    Canasta completa: aperturas × región y "restos de división" no se superponen y los ponderadores suman 1.
      - ids únicos;
      - en cada región, ninguna apertura publicada es ancestro de otra (solo hojas del árbol);
      - a lo sumo un resto por división y región;
      - pesos por región y nacional suman 1 con tolerancia 1e-6.
    """
    TOL = 1e-6
    problemas: list[str] = []
    ids = [it.id for it in items]
    if len(ids) != len(set(ids)):
        problemas.append("ids duplicados")
    regiones = sorted({it.region for it in items})
    sumas = {}
    for r in regiones:
        sub = [it for it in items if it.region == r]
        pub = [it.codigo for it in sub if not it.residual]
        anc = [(a, b) for a in pub for b in pub if a != b and b.startswith(a + ".")]
        if anc:
            problemas.append(f"{r}: aperturas superpuestas {anc[:3]}")
        res = [it.division for it in sub if it.residual]
        if len(res) != len(set(res)):
            problemas.append(f"{r}: más de un resto por división")
        sumas[r] = sum(it.peso_region for it in sub)
    nac = sum(it.peso_nacional for it in items)
    malos = {r: s for r, s in sumas.items() if abs(s - 1) > TOL}
    if malos:
        problemas.append(f"pesos regionales fuera de tolerancia: {malos}")
    if abs(nac - 1) > TOL:
        problemas.append(f"peso nacional suma {nac:.9f}")
    ok = not problemas
    det = (f"{len(items)} ítems sin superposición; pesos suman 1 (tolerancia {TOL:g}; desvío nacional {abs(nac - 1):.1e})"
           if ok else "; ".join(problemas))
    return Check("universo_consistente", ok, True, det,
                 {"items": len(items), "desvio_nacional": abs(nac - 1), "desvio_max_region": max(abs(s - 1) for s in sumas.values())})
