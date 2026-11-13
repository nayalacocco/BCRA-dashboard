"""
Exporta M2 (difusión y rotación) a JSON para la web.

  difusion.json  métricas por variante = universo × ponderación × serie (12 variantes)
  heatmap.json   r_{i,t} por ítem (Nacional 27 aperturas y cada región), original y desestacionalizado

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
                lo, hi = m["VRbanda"][3]
                variantes[f"{ukey}.{pkey}.{skey}"] = {
                    "D": _lista(m["D"], 1),
                    "buckets": [_lista(m["buckets"][:, j], 1) for j in range(len(dif.ETIQUETAS))],
                    "C": {str(k): _lista(m["C"][k], 1) for k in dif.KS},
                    "Cref": {str(k): _lista(m["Cref"][k], 1) for k in dif.KS},
                    "A": {str(k): _lista(m["A"][k], 1) for k in dif.KS},
                    "VR": {str(k): _lista(m["VR"][k], 3) for k in dif.KS},
                    "VRbanda": {str(k): [_r(a, 3), _r(b, 3)] for k, (a, b) in m["VRbanda"].items()},
                    "rho": _lista(m["rho"], 3),
                    "rho6": _lista(m["rho6"], 3),
                    "rho12": _lista(m["rho12"], 3),
                    "regimen": {"D3": _lista(reg["D3"], 1), "excesoC3": _lista(reg["excesoC3"], 1), "codigo": reg["codigo"]},
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
        "parametros": {
            "umbral_D_concentrada": dif.UMBRAL_D_CONCENTRADA,
            "umbral_D_generalizada": dif.UMBRAL_D_GENERALIZADA,
            "replicas_banda_VR": dif.N_PERMUTACIONES,
            "metodo_banda_VR": "inversión aleatoria de signos de r (elimina autocorrelación y deriva, conserva magnitudes)",
            "banda_VR_percentiles": [5, 95],
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
    return difusion


def resumen(d: dict) -> str:
    v = d["variantes"]["todos.pond.orig"]
    s = d["variantes"]["todos.pond.sa"]
    g = d["variantes"]["nacional27.simple.orig"]
    i = -1
    return (
        f"M2 {d['ultimo_periodo']} — D={v['D'][i]}% (desest. {s['D'][i]}%), C(3)={v['C']['3'][i]}% vs ref {v['Cref']['3'][i]}%, "
        f"VR(3)={v['VR']['3'][i]} banda {v['VRbanda']['3']}, VR(12)={v['VR']['12'][i]}, régimen={v['regimen']['codigo'][i]}; "
        f"Galicia-comparable <2%: {sum(b[i] for b in g['buckets'][:5]):.1f}%; "
        f"desestacionalizados {d['parametros']['desest']['items_ajustados']}/{d['parametros']['desest']['items_total']}"
    )


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    a = ap.parse_args()
    print(resumen(exportar(Path(a.data))))
