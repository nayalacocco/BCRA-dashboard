"""
Reservas netas en dos perímetros + réplica de la RIN con la metodología del programa con el FMI.

Regla general (definida con el usuario): a las reservas brutas se les resta lo que SUMA a las brutas y es
un pasivo. Todo lo de "corto plazo" es vencimiento residual ≤ 12 meses.

Perímetro A — BCRA
    Reservas brutas                                             (API 1244, diaria)
  − Encajes en USD (depósitos de entidades en el BCRA)          (API 1243, diaria)
  − Swaps de monedas (posición corta a término: línea completa con China
    y cualquier otro swap activado, p. ej. Tesoro de EE.UU.)    (planilla II.2(a), mensual)
  − Pases pasivos en ME con bancos ≤ 12 m                       (planilla II.3, mensual)
  = Reservas netas BCRA
  − BOPREAL, organismos y otros pasivos del BCRA en ME ≤ 12 m   (planilla II.1 BCRA − encajes − dep. Tesoro)
  − Depósitos en USD del Tesoro en el BCRA                      (API 1266 / A3500, diaria)
  = Reservas super netas BCRA

Perímetro B — sector público consolidado (BCRA + Tesoro)
    Reservas netas BCRA (igual que A)
  − BOPREAL, organismos y otros pasivos del BCRA en ME ≤ 12 m
  − Deuda en ME del Gobierno Central ≤ 12 m (capital + intereses) (planilla II.1 Gobierno Central)
  = Reservas netas consolidadas
  Los depósitos del Tesoro NO se restan: dentro del consolidado son una operación interna.

Hasta nov-2022 la planilla registra el swap con China dentro de II.3 junto con los pases: en esos meses
la línea se presenta agrupada ("swaps y pases").

RIN — metodología del programa (TMU, Country Report 26/1, ¶11): brutas − pasivos oficiales en ME de
plazo original ≤ 1 año (encajes, swaps con PBOC/BIS/ESF, SEDESA, ALADI, depósitos de no residentes)
− compras netas al FMI desde el inicio del programa. Los depósitos y la deuda del Tesoro no se restan.
Con datos públicos no se puede separar el plazo ORIGINAL de los pases ni SEDESA/ALADI: la réplica se
valida contra los valores publicados por el staff y solo se publica si el error es acotado.
"""

from __future__ import annotations

import bisect
import math
from dataclasses import dataclass

from .irfcl import Planilla

INICIO_PROGRAMA_FMI = "2025-04-11"  # aprobación del EFF 2025

# Valores de RIN publicados por el staff del FMI (a tipos de cambio corrientes), para validar la réplica.
# Fuente: IMF Country Report 26/1 (Argentina: 2026 Article IV y segunda revisión) y CR 25/219.
ANCLAS_STAFF_FMI = [
    {"fecha": "2024-12-31", "rin": -2400.0, "fuente": "IMF CR 26/1, ¶ reservas: fin-2024 −US$2,4 mil M"},
    {"fecha": "2025-06-13", "rin": -4700.0, "fuente": "IMF CR 25/219: −US$4,7 mil M al 13-jun-2025"},
    {"fecha": "2025-12-31", "rin": -11700.0, "fuente": "IMF CR 26/1: −US$11,7 mil M a fin-2025"},
    {"fecha": "2026-05-18", "rin": -6500.0, "fuente": "IMF CR 26/1, suplemento de staff (fecha aproximada, mediados de mayo de 2026): −US$6,5 mil M"},
]
TOLERANCIA_RIN = 750.0  # USD M: error absoluto máximo aceptable en cada ancla para publicar la réplica


@dataclass
class Serie:
    fechas: list[str]
    valores: list[float]

    @classmethod
    def de(cls, puntos: list[dict]) -> "Serie":
        pts = [p for p in puntos if p.get("valor") is not None]
        return cls([p["fecha"] for p in pts], [float(p["valor"]) for p in pts])

    def en(self, fecha: str, max_dias: int | None = None) -> float | None:
        """Último valor disponible a la fecha (≤ fecha)."""
        i = bisect.bisect_right(self.fechas, fecha) - 1
        if i < 0:
            return None
        if max_dias is not None:
            from datetime import date

            if (date.fromisoformat(fecha) - date.fromisoformat(self.fechas[i])).days > max_dias:
                return None
        return self.valores[i]

    def fecha_en(self, fecha: str) -> str | None:
        i = bisect.bisect_right(self.fechas, fecha) - 1
        return self.fechas[i] if i >= 0 else None


def componentes_planilla(p: Planilla, encajes_api: float | None, dep_tesoro_api: float | None) -> dict:
    """Componentes mensuales derivados de la planilla. Encajes y depósitos del Tesoro se toman de las
    notas del país; si no están (planillas anteriores a jun-2023), de la API a la misma fecha."""
    enc = p.notas.get("encajes")
    enc = enc if enc is not None else encajes_api
    dt = p.notas.get("dep_tesoro")
    dt = dt if dt is not None else dep_tesoro_api
    agrupado = p.fecha < "2022-12-01"
    resid = p.bcra_total() - (enc or 0.0)  # otros pasivos ≤12m del BCRA, incluidos depósitos del Tesoro
    otros = resid - dt if dt is not None else None
    return {
        "planilla": p.fecha,
        "brutas_planilla": p.brutas,
        "encajes_planilla": enc,
        "dep_tesoro_planilla": dt,
        "swaps": 0.0 if agrupado else p.swaps["total"],
        "pases": p.recompras["total"] + (p.swaps["total"] if agrupado else 0.0),
        "agrupado": agrupado,
        "otros_bcra_mas_tesoro": resid,
        "otros_bcra": otros,
        "deuda_tesoro_12m": p.gob_total(),
        "cheques_otras": (p.notas.get("cheques") or 0.0) + (p.notas.get("otras_oblig") or 0.0),
        "tramos": {
            "bcra_pases": p.recompras,
            "bcra_swaps": p.swaps,
            "bcra_capital": p.bcra_capital,
            "bcra_intereses": p.bcra_intereses,
            "gob_capital": p.gob_capital,
            "gob_intereses": p.gob_intereses,
        },
    }


def perimetros(brutas: float, encajes: float, dep_tesoro: float | None, comp: dict) -> dict:
    """Waterfalls de ambos perímetros. Devuelve líneas y totales; None donde falta un insumo."""
    swaps_pases = comp["swaps"] + comp["pases"]
    netas_a = brutas - encajes - swaps_pases
    if dep_tesoro is not None and comp["otros_bcra"] is not None:
        otros = comp["otros_bcra"]
        super_a = netas_a - otros - dep_tesoro
    elif dep_tesoro is None and comp["otros_bcra"] is None:
        # sin desagregar: la planilla ya incluye los depósitos del Tesoro en el residuo
        otros = None
        super_a = netas_a - comp["otros_bcra_mas_tesoro"]
    else:
        otros = comp["otros_bcra"]
        super_a = netas_a - otros - dep_tesoro if (otros is not None and dep_tesoro is not None) else None
    netas_b = netas_a - otros - comp["deuda_tesoro_12m"] if otros is not None else None
    return {"netas_a": netas_a, "super_a": super_a, "netas_b": netas_b, "otros_bcra": otros}


def lineas_waterfall(brutas: float, encajes: float, dep_tesoro: float | None, comp: dict, perimetro: str) -> list[dict]:
    """Líneas del waterfall con signo (+ brutas, − deducciones, = subtotales)."""
    r = perimetros(brutas, encajes, dep_tesoro, comp)
    L: list[dict] = [{"id": "brutas", "tipo": "base", "monto": brutas}]
    L.append({"id": "encajes", "tipo": "resta", "monto": encajes})
    if comp["agrupado"]:
        L.append({"id": "swaps_pases", "tipo": "resta", "monto": comp["swaps"] + comp["pases"]})
    else:
        L.append({"id": "swaps", "tipo": "resta", "monto": comp["swaps"]})
        L.append({"id": "pases", "tipo": "resta", "monto": comp["pases"]})
    L.append({"id": "netas_a", "tipo": "total", "monto": r["netas_a"]})
    if perimetro == "A":
        if r["otros_bcra"] is not None and dep_tesoro is not None:
            L.append({"id": "otros_bcra", "tipo": "resta", "monto": r["otros_bcra"]})
            L.append({"id": "dep_tesoro", "tipo": "resta", "monto": dep_tesoro})
        else:
            L.append({"id": "otros_bcra_mas_tesoro", "tipo": "resta", "monto": comp["otros_bcra_mas_tesoro"]})
        L.append({"id": "super_a", "tipo": "total", "monto": r["super_a"]})
    else:
        if r["netas_b"] is None:
            return L
        L.append({"id": "otros_bcra", "tipo": "resta", "monto": r["otros_bcra"]})
        L.append({"id": "deuda_tesoro_12m", "tipo": "resta", "monto": comp["deuda_tesoro_12m"]})
        L.append({"id": "netas_b", "tipo": "total", "monto": r["netas_b"]})
    return L


def suma_waterfall(lineas: list[dict]) -> list[tuple[str, float, float]]:
    """Recalcula cada subtotal desde las líneas: [(id, total_declarado, total_recalculado)]."""
    out = []
    acum = 0.0
    for l in lineas:
        if l["tipo"] == "base":
            acum = l["monto"]
        elif l["tipo"] == "resta":
            acum -= l["monto"]
        else:
            out.append((l["id"], l["monto"], acum))
    return out


def rin_fmi(brutas: float, encajes: float, comp: dict, compras_netas_fmi_usd: float) -> float:
    """RIN según el texto del TMU con los insumos públicos disponibles (sin pases: plazo original > 1 año
    en general; sin SEDESA/ALADI: no se publican)."""
    swaps = comp["swaps"] if not comp["agrupado"] else comp["pases"]
    return brutas - encajes - swaps - comp["cheques_otras"] - compras_netas_fmi_usd


def ritmo_mensual(v_hoy: float, v_antes: float, dias: int) -> float:
    """Tasa mensual equivalente (30,44 días) entre dos valores separados por `dias`."""
    return math.exp(math.log(v_hoy / v_antes) * 30.4375 / dias) - 1


def meses_hasta(nivel: float, limite: float, g_nivel: float, g_limite: float, arriba: bool) -> float | None:
    """Meses hasta que el nivel toque el límite si ambos siguen a su ritmo. None si no converge."""
    d = math.log(limite / nivel) if arriba else math.log(nivel / limite)
    v = (math.log1p(g_nivel) - math.log1p(g_limite)) if arriba else (math.log1p(g_limite) - math.log1p(g_nivel))
    if d <= 0:
        return 0.0
    if v <= 1e-9:
        return None
    return d / v
