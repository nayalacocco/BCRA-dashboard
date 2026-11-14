"""
Parser de la "Planilla de Reservas Internacionales y Liquidez en Moneda Extranjera" del BCRA
(formato IRFCL del FMI, publicada bajo las NEDD). Un PDF por mes, datos a fin de mes, USD millones.

Qué se extrae (todo a valor nominal, residual ≤ 12 meses, columnas ≤1m / 1–3m / 3–12m):

  I.A      Activos de reserva oficiales (= reservas brutas a fin de mes)
  II.1     Préstamos, valores y depósitos en ME — egresos de capital e intereses,
           por separado para Autoridades Monetarias (BCRA) y Gobierno Central (Tesoro)
  II.2(a)  Posiciones cortas a término (componente a término de los swaps de monedas: China y otros)
  II.3     Egresos relacionados con recompras (pases pasivos en ME con bancos)
  Notas del país (c): composición de II.1 del BCRA — encajes ("Depósitos en Otras Monedas"),
           depósitos del Gobierno Nacional en ME, cheques cancelatorios/CEDIN y otras obligaciones.

Robustez:
  - Dos formatos numéricos según el año ("62,023.84" y "29.639,73").
  - Las columnas se identifican por la posición x (borde derecho) de los 8 valores de la fila II.1,
    no por el orden de los tokens: las celdas vacías no desplazan valores.
  - El signo de la columna Gobierno Central cambió entre años (negativo/positivo): se usa |valor|,
    porque todas las partidas leídas son egresos.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field

import pdfplumber

NUM_RE = re.compile(r"^\(?-?\d{1,3}(?:[.,]\d{3})*[.,]\d{1,2}\)?$|^-?\d+[.,]\d{1,2}$")
TRAMOS = ("total", "m1", "m3", "m12")  # total, ≤1m, 1–3m, 3–12m


def num(tok: str) -> float:
    """'29.639,73' | '62,023.84' | '-0,22' | '(1.234,5)' → float."""
    s = tok.strip().replace("−", "-")
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    # el separador decimal es el último '.' o ',' seguido de 1–2 dígitos al final
    m = re.match(r"^(-?[\d.,]*?)([.,])(\d{1,2})$", s)
    if not m:
        return float(s.replace(".", "").replace(",", ""))
    entero, _, dec = m.groups()
    entero = entero.replace(".", "").replace(",", "")
    v = float(f"{entero or '0'}.{dec}")
    return -v if neg else v


@dataclass
class Planilla:
    fecha: str  # YYYY-MM-DD (fin de mes)
    brutas: float
    bcra_capital: dict[str, float]
    bcra_intereses: dict[str, float]
    gob_capital: dict[str, float]
    gob_intereses: dict[str, float]
    swaps: dict[str, float]  # II.2(a) posiciones cortas, BCRA
    recompras: dict[str, float]  # II.3 recompras, BCRA
    notas: dict[str, float | None] = field(default_factory=dict)
    advertencias: list[str] = field(default_factory=list)

    def bcra_total(self, tramo: str = "total") -> float:
        return self.bcra_capital[tramo] + self.bcra_intereses[tramo]

    def gob_total(self, tramo: str = "total") -> float:
        return self.gob_capital[tramo] + self.gob_intereses[tramo]

    def to_dict(self) -> dict:
        return {
            "fecha": self.fecha,
            "brutas": self.brutas,
            "bcra_capital": self.bcra_capital,
            "bcra_intereses": self.bcra_intereses,
            "gob_capital": self.gob_capital,
            "gob_intereses": self.gob_intereses,
            "swaps": self.swaps,
            "recompras": self.recompras,
            "notas": self.notas,
            "advertencias": self.advertencias,
        }


def _lineas(page, tol: float = 3.5) -> list[list[dict]]:
    words = page.extract_words(keep_blank_chars=False, use_text_flow=False, x_tolerance=1.5)
    words.sort(key=lambda w: (round(w["top"], 1), w["x0"]))
    lineas: list[list[dict]] = []
    for w in words:
        if lineas and abs(lineas[-1][0]["top"] - w["top"]) <= tol:
            lineas[-1].append(w)
        else:
            lineas.append([w])
    for l in lineas:
        l.sort(key=lambda w: w["x0"])
    return lineas


def _texto(linea: list[dict]) -> str:
    return " ".join(w["text"] for w in linea)


def _nums(linea: list[dict], xmin: float = 0) -> list[tuple[float, float]]:
    """[(x1, valor)] de los tokens numéricos de la línea a la derecha de xmin."""
    out = []
    for w in linea:
        t = w["text"]
        if w["x0"] >= xmin and NUM_RE.match(t):
            out.append((w["x1"], num(t)))
    return out


def _cero() -> dict[str, float]:
    return {k: 0.0 for k in TRAMOS}


def _asignar(vals: list[tuple[float, float]], anclas: list[float], tol: float = 30) -> list[float | None]:
    out: list[float | None] = [None] * len(anclas)
    for x1, v in vals:
        j = min(range(len(anclas)), key=lambda k: abs(anclas[k] - x1))
        if abs(anclas[j] - x1) <= tol:
            out[j] = v
    return out


def _bloque(celdas: list[float | None], desde: int) -> dict[str, float]:
    return {k: abs(celdas[desde + i] or 0.0) for i, k in enumerate(TRAMOS)}


def parse(pdf_bytes: bytes) -> Planilla:
    adv: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        paginas = [_lineas(p) for p in pdf.pages]
        texto_total = "\n".join(p.extract_text() or "" for p in pdf.pages)

    # ── Fecha de corte ──
    m = re.search(r"\b(\d{2})/(\d{2})/(\d{2})\b", texto_total)
    if not m:
        raise ValueError("No se encontró la fecha de corte (dd/mm/aa)")
    d, mo, y = m.groups()
    fecha = f"20{y}-{mo}-{d}"

    # ── I.A Reservas brutas: el primer valor numérico grande de la página 1 ──
    brutas = None
    for l in paginas[0]:
        ns = [v for _, v in _nums(l, xmin=150)]
        if ns and abs(ns[0]) > 1000:
            brutas = abs(ns[0])
            break
    if brutas is None:
        raise ValueError("No se encontró I.A Activos de reserva oficiales")

    # ── Sección II: la página que la contiene ──
    pag2 = next(
        (p for p in paginas if any("Flujos netos predeterminados" in _texto(l) for l in p)),
        paginas[1] if len(paginas) > 1 else None,
    )
    if pag2 is None:
        raise ValueError("No se encontró la sección II")
    # ancla de columnas: primera línea con 8 valores (II.1 total, BCRA y Gobierno)
    anclas = None
    i_ancla = None
    for i, l in enumerate(pag2):
        ns = _nums(l, xmin=180)
        if len(ns) == 8:
            anclas = [x for x, _ in ns]
            i_ancla = i
            break
    if anclas is None:
        raise ValueError("No se encontró la fila II.1 con 8 columnas")

    total_ii1 = _asignar(_nums(pag2[i_ancla], 180), anclas)
    cap = interes = swaps = recompras = None
    for l in pag2[i_ancla + 1 :]:
        t = _texto(l)
        ns = _nums(l, 180)
        if not ns:
            if t.startswith("III.") or "contigentes" in t or "contingentes" in t:
                break
            continue
        celdas = _asignar(ns, anclas)
        if "Capital" in t and cap is None:
            cap = celdas
        elif "Intereses" in t and interes is None:
            interes = celdas
        elif "cortas" in t and swaps is None:
            swaps = celdas
        elif "recompras" in t and "reversi" not in t and recompras is None:
            recompras = celdas

    tot_b, tot_g = _bloque(total_ii1, 0), _bloque(total_ii1, 4)
    if cap is None:
        raise ValueError("No se encontró la fila de capital (II.1)")
    cap_b, cap_g = _bloque(cap, 0), _bloque(cap, 4)
    if interes is None:
        adv.append("Fila de intereses sin rótulo: se obtiene como total − capital")
        int_b = {k: max(tot_b[k] - cap_b[k], 0.0) for k in TRAMOS}
        int_g = {k: max(tot_g[k] - cap_g[k], 0.0) for k in TRAMOS}
    else:
        int_b, int_g = _bloque(interes, 0), _bloque(interes, 4)
    for nombre, tot, c, i_ in (("BCRA", tot_b, cap_b, int_b), ("Gobierno", tot_g, cap_g, int_g)):
        if abs(tot["total"] - c["total"] - i_["total"]) > 1.0:
            adv.append(f"II.1 {nombre}: total ≠ capital + intereses ({tot['total']:.2f} vs {c['total'] + i_['total']:.2f})")

    sw = _bloque(swaps, 0) if swaps else _cero()
    rc = _bloque(recompras, 0) if recompras else _cero()

    # ── Notas del país ──
    plano = re.sub(r"\s+", " ", texto_total)

    def nota(patron: str) -> float | None:
        mm = re.search(patron + r"\s*USD\s*([\d.,]+)\s*millones", plano, flags=re.I)
        return abs(num(mm.group(1))) if mm else None

    notas = {
        "encajes": nota(r"Dep[oó]sitos en Otras Monedas\"?\)?"),
        "dep_tesoro": nota(r"Dep[oó]sitos del Gobierno Nacional \(en otras monedas\)"),
        "cheques": nota(r"Cheques Cancelatorios en Otras Monedas y Certificados de Dep[oó]sitos para la Inversi[oó]n\"?"),
        "otras_oblig": nota(r"Otras\s+Obligaciones en Moneda Extranjera"),
    }
    # "Depósitos en Otras Monedas" aparece también dentro de la nota de pasivos monetarios
    # ("... pesos equivalentes a USD x"): se prefiere la nota (c) de la sección II.1.
    mc = re.search(
        r"secci[oó]n II\.1[^.]*?Dep[oó]sitos en Otras Monedas USD\s*([\d.,]+)\s*millones", plano, flags=re.I
    )
    if mc:
        notas["encajes"] = abs(num(mc.group(1)))

    return Planilla(
        fecha=fecha,
        brutas=brutas,
        bcra_capital=cap_b,
        bcra_intereses=int_b,
        gob_capital=cap_g,
        gob_intereses=int_g,
        swaps=sw,
        recompras=rc,
        notas=notas,
        advertencias=adv,
    )
