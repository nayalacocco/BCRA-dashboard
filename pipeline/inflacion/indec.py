"""
Ingesta y parseo de INDEC (IPC base dic-2016).

Fuentes:
  - serie_ipc_divisiones.csv : Nacional + regiones; nivel general, divisiones, categorías, bienes/servicios.
  - serie_ipc_aperturas.csv  : solo regiones; divisiones + grupos + clases seleccionados.
  - ponderadores_ipc.xls     : ponderadores de base por región (división → grupo → clase).

Formato CSV: ';' separado, Latin-1, decimal con coma, "NA" faltante.
  Codigo;Descripcion;Clasificador;Periodo;Indice_IPC;v_m_IPC;v_i_a_IPC;Region
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import pandas as pd
import xlrd

BASE = "https://www.indec.gob.ar/ftp/cuadros/economia/"
URL_DIVISIONES = BASE + "serie_ipc_divisiones.csv"
URL_APERTURAS = BASE + "serie_ipc_aperturas.csv"
URL_PONDERADORES = BASE + "ponderadores_ipc.xls"

REGIONES = ["GBA", "Pampeana", "Noreste", "Noroeste", "Cuyo", "Patagonia"]

# Peso de cada región en el IPC Nacional (participación en el gasto de consumo de los hogares).
# Fuente: INDEC, informes técnicos del IPC ("Participación regional en el gasto de consumo").
# Publicados con 1 decimal: suman 100,1 %, así que se normalizan a 1 (PESO_REGION_NORM).
# Se validan en la reconciliación: si no replican el Nacional, el check falla.
PESO_REGION = {
    "GBA": 0.447,
    "Pampeana": 0.342,
    "Noreste": 0.045,
    "Noroeste": 0.069,
    "Cuyo": 0.052,
    "Patagonia": 0.046,
}
PESO_REGION_NORM = {r: w / sum(PESO_REGION.values()) for r, w in PESO_REGION.items()}


def _num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(
        s.astype(str).str.strip().replace({"NA": None, "": None}).str.replace(",", ".", regex=False),
        errors="coerce",
    )


def parse_csv(raw: bytes) -> pd.DataFrame:
    """CSV de INDEC → DataFrame largo con columnas normalizadas."""
    df = pd.read_csv(io.BytesIO(raw), sep=";", encoding="latin-1", dtype=str)
    df.columns = [c.strip() for c in df.columns]
    desc_col = "Descripcion" if "Descripcion" in df.columns else "Descripcion_aperturas"
    out = pd.DataFrame(
        {
            "codigo": df["Codigo"].str.strip(),
            "descripcion": df[desc_col].fillna("").str.strip(),
            "clasificador": df["Clasificador"].str.strip(),
            "fecha": pd.to_datetime(df["Periodo"].str.strip(), format="%Y%m"),
            "indice": _num(df["Indice_IPC"]),
            "vm": _num(df["v_m_IPC"]),
            "via": _num(df["v_i_a_IPC"]),
            "region": df["Region"].str.strip(),
        }
    )
    return out.dropna(subset=["fecha"])


def parse_ponderadores(raw: bytes) -> pd.DataFrame:
    """
    ponderadores_ipc.xls → DataFrame largo: codigo, descripcion, region, peso (fracción del gasto regional).
    Estructura verificada (nov-2026): fila de encabezado con "Código | Descripción | GBA | ... | Patagonia".
    """
    wb = xlrd.open_workbook(file_contents=raw)
    sh = wb.sheet_by_index(0)
    header_row = None
    for i in range(min(sh.nrows, 20)):
        vals = [str(sh.cell_value(i, j)).strip() for j in range(sh.ncols)]
        if vals and vals[0].lower().startswith("c") and "GBA" in vals:
            header_row = i
            break
    if header_row is None:
        raise ValueError("ponderadores_ipc.xls: no se encontró la fila de encabezado")
    header = [str(sh.cell_value(header_row, j)).strip() for j in range(sh.ncols)]
    reg_cols = {r: header.index(r) for r in REGIONES}

    rows = []
    for i in range(header_row + 1, sh.nrows):
        code = sh.cell_value(i, 0)
        if code in ("", None):
            continue
        code = str(code).strip()
        if code.endswith(".0") and code.replace(".0", "").isdigit():  # "0.0" → "0"
            code = code[:-2]
        desc = str(sh.cell_value(i, 1)).strip()
        for r, j in reg_cols.items():
            v = sh.cell_value(i, j)
            if v in ("", None):
                continue
            rows.append({"codigo": code, "descripcion": desc, "region": r, "peso": float(v)})
    return pd.DataFrame(rows)


@dataclass
class IndecRaw:
    divisiones: pd.DataFrame
    aperturas: pd.DataFrame
    ponderadores: pd.DataFrame
