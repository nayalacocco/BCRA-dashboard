"""
Exporta M2 (difusión y rotación) a JSON para la web.

  difusion.json  métricas por variante = universo × ponderación × serie (12 variantes)
  heatmap.json   r_{i,t} por ítem (Nacional 27 aperturas y cada región), original y desestacionalizado
  precios_relativos.json  nivel relativo vs. anclas, dirección 3/6/12 meses y backtest (desestacionalizado)

Uso sin descargar nada (lee panel_indices.json e items.json ya generados):
  python -m inflacion.difusion_export --data ../data/inflacion
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from . import difusion as dif
from . import nulo
from . import precios_relativos as prel
from .desest import P_ESTACIONAL, VENTANA_ESTACIONAL, desestacionalizar
from .indec import REGIONES

UNIVERSOS = {
    "todos": "Canasta completa (aperturas × región + restos de división)",
    "publicados": "Solo aperturas publicadas por INDEC (sin restos de división)",
    "nacional27": "27 aperturas a nivel nacional (comparable con el gráfico de Banco Galicia)",
}


def _r(x, n=2):
    if x is None or (isinstance(x, float) and (np.isnan(x) or np.isinf(x))):
        return None
    return round(float(x), n)


def _lista(a, n=2):
    return [_r(v, n) for v in np.asarray(a, dtype=float)]


def nacional27(items: pd.DataFrame, panel: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, pd.DataFrame]:
    """Agrega cada apertura común a las 6 regiones a nivel nacional (índice de base fija)."""
    pub = items[~items.residual]
    comunes = sorted(set.intersection(*[set(pub[pub.region == r].codigo) for r in REGIONES]))
    cols, pesos, meta = {}, {}, []
    for c in comunes:
        sub = pub[pub.codigo == c]
        w = sub.set_index("id").peso_nacional
        cols[c] = panel[w.index].mul(w, axis=1).sum(axis=1) / w.sum()
        pesos[c] = float(w.sum())
        meta.append({"id": c, "codigo": c, "division": sub.division.iloc[0], "descripcion": sub.descripcion.iloc[0], "residual": False})
    return pd.DataFrame(cols), pd.Series(pesos), pd.DataFrame(meta)


def exportar(data_dir: Path) -> dict:
    p = json.loads((data_dir / "panel_indices.json").read_text())
    items = pd.DataFrame(json.loads((data_dir / "items.json").read_text()))
    panel = pd.DataFrame(p["items"], index=pd.to_datetime(p["fechas"]))[list(items.id)]
    w = items.set_index("id").peso_nacional

    panel_sa, info_sa = desestacionalizar(panel)
    series = {"orig": panel, "sa": panel_sa}
    headline = {k: dif.indice_agregado(v, w) for k, v in series.items()}

    variantes: dict[str, dict] = {}
    heat: dict[str, dict] = {}
    fechas = None
    n_univ = {}
    for skey, pn in series.items():
        pub_ids = list(items[~items.residual].id)
        nac, w_nac, meta_nac = nacional27(items, pn)
        universos = {
            "todos": (pn, w),
            "publicados": (pn[pub_ids], w[pub_ids]),
            "nacional27": (nac, w_nac),
        }
        for ukey, (pu, wu) in universos.items():
            n_univ[ukey] = pu.shape[1]
            for pkey, wb in (("pond", wu), ("simple", None)):
                m = dif.metricas(pu, wb, headline[skey])
                reg = dif.regimen(m)
                fechas = m["fechas"]
                variantes[f"{ukey}.{pkey}.{skey}"] = {
                    "D": _lista(m["D"], 1),
                    "buckets": [_lista(m["buckets"][:, j], 1) for j in range(len(dif.ETIQUETAS))],
                    "C": {str(k): _lista(m["C"][k], 1) for k in dif.KS},
                    "Cref": {str(k): _lista(m["Cref"][k], 1) for k in dif.KS},
                    "A": {str(k): _lista(m["A"][k], 1) for k in dif.KS},
                    "VR": {str(k): _lista(m["VR"][k], 3) for k in dif.KS},
                    "Cnull": {str(k): [_lista(m["nulo"]["C"][k][j], 1) for j in range(3)] for k in dif.KS},
                    "VRnull": {str(k): [_lista(m["nulo"]["VR"][k][j], 3) for j in range(3)] for k in dif.KS},
                    "umbrales_D": [_r(reg["umbrales"][0], 1), _r(reg["umbrales"][1], 1)],
                    "rho": _lista(m["rho"], 3),
                    "rho6": _lista(m["rho6"], 3),
                    "rho12": _lista(m["rho12"], 3),
                    "regimen": {"D3": _lista(reg["D3"], 1), "excesoC3": _lista(reg["excesoC3"], 1),
                                "amplitud": reg["amplitud"], "dinamica": reg["dinamica"], "codigo": reg["codigo"]},
                }
                # Heatmap: r en puntos log ×100, ponderado (el r no depende de la ponderación)
                if pkey == "pond" and ukey in ("todos", "nacional27"):
                    R = m["R"] * 100
                    if ukey == "nacional27":
                        heat.setdefault("Nacional", {"items": [
                            {**row, "peso": _r(100 * w_nac[row["id"]] / w_nac.sum(), 2)} for row in meta_nac.to_dict("records")
                        ]})[skey] = {c: _lista(R[c], 2) for c in R.columns}
                    else:
                        for reg_name in REGIONES:
                            sub = items[items.region == reg_name]
                            wr = sub.set_index("id").peso_region
                            heat.setdefault(reg_name, {"items": [
                                {"id": r_.id, "codigo": r_.codigo, "division": r_.division, "descripcion": r_.descripcion,
                                 "residual": bool(r_.residual), "peso": _r(100 * r_.peso_region / wr.sum(), 2)}
                                for r_ in sub.itertuples()
                            ]})[skey] = {c: _lista(R[c], 2) for c in sub.id}

    fechas_s = [f"{f:%Y-%m}" for f in fechas]
    ajustados = [k for k, v in info_sa.items() if v["ajustado"]]
    difusion = {
        "schema_version": 1,
        "fechas": fechas_s,
        "ultimo_periodo": fechas_s[-1],
        "ks": list(dif.KS),
        "buckets_etiquetas": dif.ETIQUETAS,
        "universos": {k: {"descripcion": v, "n": n_univ[k]} for k, v in UNIVERSOS.items()},
        "headline": {k: _lista(((h / h.shift(1) - 1) * 100).iloc[1:], 3) for k, h in headline.items()},
        "regimenes": dif.REGIMENES,
        "amplitud_etiquetas": dif.AMPLITUD,
        "dinamica_etiquetas": dif.DINAMICA,
        "parametros": {
            "umbrales_amplitud": "terciles de la distribución histórica de D̄ (3 meses) de cada variante",
            "replicas_null": nulo.N_REPLICAS,
            "metodo_null": "permutación de los años dentro de cada mes calendario, ítem por ítem (conserva estacionalidad, deriva media y volatilidad de cada rubro; rompe la dependencia entre meses)",
            "null_percentiles": list(nulo.PERCENTILES),
            "desest": {
                "metodo": f"STL robusto sobre Δln del índice, período 12, ventana estacional {VENTANA_ESTACIONAL}; se ajusta solo si Kruskal–Wallis p < {P_ESTACIONAL}",
                "items_ajustados": len(ajustados),
                "items_total": len(info_sa),
            },
        },
        "variantes": variantes,
    }
    heatmap = {"schema_version": 1, "fechas": fechas_s, "unidad": "puntos log ×100 (≈ pp vs. nivel general)", "grupos": heat}
    (data_dir / "difusion.json").write_text(json.dumps(difusion, ensure_ascii=False, separators=(",", ":")))
    (data_dir / "heatmap.json").write_text(json.dumps(heatmap, ensure_ascii=False, separators=(",", ":")))
    (data_dir / "desest.json").write_text(json.dumps(info_sa, ensure_ascii=False, separators=(",", ":")))
    (data_dir / "precios_relativos.json").write_text(
        json.dumps(exportar_precios_relativos(items, panel_sa, headline["sa"]), ensure_ascii=False, separators=(",", ":"))
    )
    return difusion


def exportar_precios_relativos(items: pd.DataFrame, panel_sa: pd.DataFrame, headline_sa: pd.Series) -> dict:
    """Nivel relativo vs. anclas (series desestacionalizadas) para Nacional (27) y cada región."""
    nac, w_nac, meta_nac = nacional27(items, panel_sa)
    grupos: dict[str, dict] = {}
    L_nac = prel.nivel_relativo(nac, headline_sa)
    fechas = [f"{f:%Y-%m}" for f in L_nac.index]

    nombres = {**dict(zip(meta_nac.id, meta_nac.descripcion)), **dict(zip(items.id, items.descripcion))}

    def filas(L: pd.DataFrame) -> dict:
        res = prel.resumen_items(L)
        return {
            c: {
                "nombre": nombres.get(c, c),
                "ancla": r.ancla,
                "desvio_filtrada": _r(r.desvio_filtrada, 1),
                "desvio_simple": _r(r.desvio_simple, 1),
                **{f"d{k}": _r(getattr(r, f"d{k}"), 1) for k in prel.KS_DIR},
            }
            for c, r in res.iterrows()
        }

    af, _ = prel.anclas(L_nac)
    grupos["Nacional"] = {
        "items": filas(L_nac),
        # índice del precio relativo con el ancla filtrada = 100 (para el gráfico de evolución)
        "serie": {c: _lista(100 * np.exp(L_nac[c] - af[c]), 1) for c in L_nac.columns},
        "peso": {c: _r(100 * w_nac[c] / w_nac.sum(), 2) for c in L_nac.columns},
    }
    for reg_name in REGIONES:
        ids = list(items[items.region == reg_name].id)
        grupos[reg_name] = {"items": filas(prel.nivel_relativo(panel_sa[ids], headline_sa))}

    m = prel.meses_sin_cepo(L_nac.index)
    return {
        "schema_version": 1,
        "fechas": fechas,
        "serie": "desestacionalizada",
        "ancla": {
            "tipo": "historia_filtrada",
            "regla": "promedio del nivel relativo en los meses sin cepo cambiario",
            "periodos": [[a, b or fechas[-1]] for a, b in prel.SIN_CEPO],
            "meses": int(m.sum()),
            "meses_total": len(fechas),
            "fuentes": "Fin del cepo: BCRA Com. A 6770 (1/9/2019); fin del cepo para personas humanas 14/4/2025",
        },
        "backtest": prel.backtest(L_nac),
        "grupos": grupos,
    }


def resumen(d: dict) -> str:
    v = d["variantes"]["todos.pond.orig"]
    s = d["variantes"]["todos.pond.sa"]
    i = -1
    return (
        f"M2 {d['ultimo_periodo']} — D={v['D'][i]}% (desest. {s['D'][i]}%), C(3)={v['C']['3'][i]}% vs null p50 {v['Cnull']['3'][1][i]}% "
        f"[{v['Cnull']['3'][0][i]}–{v['Cnull']['3'][2][i]}], VR(3)={v['VR']['3'][i]} null [{v['VRnull']['3'][0][i]}–{v['VRnull']['3'][2][i]}], "
        f"VR(12)={v['VR']['12'][i]}, umbrales D {v['umbrales_D']}, régimen={v['regimen']['codigo'][i]}; "
        f"más de 1 pp sobre el general: {sum(b[i] for b in v['buckets'][-2:]):.1f}%; "
        f"desestacionalizados {d['parametros']['desest']['items_ajustados']}/{d['parametros']['desest']['items_total']}"
    )


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    a = ap.parse_args()
    print(resumen(exportar(Path(a.data))))
