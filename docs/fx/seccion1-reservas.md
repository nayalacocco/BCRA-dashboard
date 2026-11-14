# Tipo de cambio — PR A: dónde está y bajo qué reglas + reservas netas

## Alcance

- Página `/mercado/fx` en sistema v5:
  - bajada por reglas;
  - franja de seis KPIs;
  - sección 1 (banda, distancias, financieros y paralelos);
  - compras del BCRA;
  - reservas netas en dos perímetros, con panel de composición;
  - calendario de vencimientos a 12 meses.
- La vista anterior queda en `/mercado/fx/series` hasta que las secciones 2–6 la reemplacen.
- Pipeline `pipeline/fx`, sin carga manual. Corre en GitHub Actions dos veces por día hábil.

## Fuentes (todas públicas, sin credenciales)

| Serie | Fuente | Frecuencia | Desde |
|---|---|---|---|
| A3500 | BCRA API v4 · variable 5 | diaria | 2002 |
| Piso y techo de la banda | BCRA API v4 · variables 1187 y 1188 (valores oficiales) | diaria | 14-04-2025 |
| MEP, CCL, blue, cripto (USDT) | argentinadatos.com (venta) | diaria (cripto incluye fines de semana) | MEP 2018, cripto 2023 |
| Compras netas del BCRA | BCRA API v4 · variable 78 | diaria, unos 6 días hábiles de rezago | 2003 |
| Reservas brutas | BCRA API v4 · variable 1244 | diaria | 1996 |
| Encajes en USD | BCRA API v4 · variable 1243 (cuenta corriente en ME en el BCRA) | diaria | 2003 |
| Depósitos del Tesoro en ME | BCRA API v4 · variable 1266 ÷ A3500 | diaria | 01-2024 |
| Swaps, pases, vencimientos ≤ 12 m (BCRA y Gobierno Central) | Planilla de Reservas Internacionales y Liquidez en ME (NEDD-FMI), `tempMMYY.pdf` | mensual | 2016 (faltan jul-2023 a may-2024 en el sitio del BCRA) |
| Compras netas al FMI | IMF, *Transactions with the Fund* (acumulado a cada fin de mes; la fuente recorta la fecha de corte al último mes cerrado) | mensual | 2025 |
| USD por DEG | BCRA API cambiaria · XDR | diaria | 2016 |

Validaciones de fuente:

- Las brutas de la planilla coinciden con la API en todos los cierres de mes.
- Los encajes y los depósitos del Tesoro de la nota (c) de la planilla coinciden con las variables 1243 y 1266 / A3500. Al 30-09-2026: 13.293,22 y 1.124,5.

## Banda

Los valores de la banda se toman de la serie oficial del BCRA; la fórmula no se reconstruye.

- **Regla vigente:** desde el 01-01-2026 el deslizamiento mensual del piso y del techo sigue el último dato de inflación mensual del INDEC (T-2).
- **Hasta el 31-12-2025:** piso −1 % y techo +1 % mensual desde $1.000–1.400.
- **Fuente:** <https://www.bcra.gob.ar/regimen-de-bandas-cambiarias/>.

Distancias:

- Al techo: techo / oficial − 1.
- Al piso: 1 − piso / oficial, es decir, cuánto tendría que caer el oficial.
- Tiempo hasta tocar cada límite: tasas mensuales equivalentes de los últimos 91 días del oficial y del límite. Es una extrapolación mecánica, no una proyección.

## Reservas netas

**Regla general:** a las brutas se les resta lo que suma a las brutas y es un pasivo. "Corto plazo" significa vencimiento residual ≤ 12 meses.

- El swap con China suma completo a las brutas, así que se resta completo.
- Un swap no activado (por ejemplo, el del Tesoro de EE.UU.) no suma, así que solo se resta lo usado.
- La planilla registra ambos casos en II.2(a), posiciones cortas a término, y se resta ese total.
- El swap con China se resta por lo que suma a las brutas, no por su plazo. El acuerdo marco se renovó el 05-08-2026 por cinco años (hasta 2031). La planilla registra cada operación a 3–12 meses, pero no se cuenta como vencimiento en el calendario.

### Perímetro A — BCRA

| | Concepto | Fuente |
|---|---|---|
| | Brutas | API 1244 |
| − | Encajes en USD | API 1243 |
| − | Swaps (China completa + otros activados) | Planilla II.2(a) |
| − | Pases en ME con bancos ≤ 12 m | Planilla II.3 |
| = | **Netas BCRA** | |
| − | BOPREAL, organismos, intereses y otros pasivos del BCRA ≤ 12 m | Planilla II.1 BCRA − encajes − depósitos del Tesoro |
| − | Depósitos en USD del Tesoro | API 1266 / A3500 |
| = | **Super netas BCRA** | |

### Perímetro B — sector público consolidado

| | Concepto | Fuente |
|---|---|---|
| | Netas BCRA | |
| − | BOPREAL, organismos y otros pasivos del BCRA ≤ 12 m | Planilla II.1 BCRA |
| − | Deuda en ME del Gobierno Central ≤ 12 m (capital + intereses: FMI, organismos, bonos, repos) | Planilla II.1 Gobierno Central |
| = | **Netas consolidadas** | |

Los depósitos del Tesoro no se restan en B.

### Diaria vs. mensual

La serie diaria (desde jul-2024) combina dos fuentes:

- los datos diarios de brutas, encajes y depósitos del Tesoro;
- los componentes de la última planilla publicada.

No se combina con planillas de más de 120 días de antigüedad: el hueco de jul-2023 a may-2024 queda sin dato.

La serie mensual (desde 2016) usa solo la planilla. Hasta nov-2022 la planilla agrupa el swap con China y los pases en II.3, y en esos meses la línea se muestra agrupada.

### Validaciones automáticas (fallan el pipeline si no se cumplen)

1. **Waterfall = total** en cada fecha (diaria y mensual) y en ambos perímetros.
2. **No doble conteo.** Se simula un desembolso del FMI de USD 1.000 M depositado por el Tesoro en el BCRA:
   - las super netas A no cambian, porque el desembolso se resta una sola vez, como depósito;
   - las netas B suben 1.000, porque la deuda no vence en 12 meses y los depósitos no se restan;
   - si la cuota vence en 12 meses, B no cambia, porque se resta una vez, como deuda.

   Hay test unitario y chequeo en cada corrida.

### Comparación con estimaciones públicas

**Perímetro A.** Federico Machado (citado por Perfil, noviembre de 2026) estima netas por USD 11.677 M con brutas por USD 49.200 M. El panel da USD 10.793 M al 11-11-2026, con brutas por 49.336. La diferencia, cerca de 0,9 mil M, está dentro de lo que explican los criterios:

- el tratamiento de los pases con bancos (USD 2.488 M a 12 meses);
- los componentes mensuales al 30-09.

**Perímetro B.** No hay una estimación pública regular con el mismo perímetro.

## RIN con la metodología del programa con el FMI

**Definición** (TMU, Country Report 26/1, ¶11):

- brutas;
- − pasivos oficiales en ME de plazo original ≤ 1 año: encajes, swaps con PBOC, BIS y ESF, SEDESA, ALADI, depósitos de no residentes;
- − compras netas al FMI desde el inicio del programa.

La deuda y los depósitos del Tesoro no se restan.

**Réplica:** con datos públicos no se puede separar el plazo original de los pases ni conocer SEDESA o ALADI.

**Validación** contra cuatro valores del staff, a tipos corrientes:

| Fecha | Staff | Fuente |
|---|---|---|
| 31-12-2024 | −2,4 mil M | CR 26/1 |
| 13-06-2025 | −4,7 mil M | CR 25/219 |
| 31-12-2025 | −11,7 mil M | CR 26/1 |
| mediados de mayo de 2026 | −6,5 mil M | suplemento del CR 26/1 |

Tolerancia: USD 750 M en cada fecha.

**Resultado:** no se alcanza (errores de hasta unos USD 3 mil M), así que **no se publica**. El panel muestra la tabla de la réplica y el motivo.

## Limitaciones conocidas

- **Rezago de la planilla.** Sale semanas después del cierre. Entre planillas, swaps, pases y vencimientos son los del último cierre.
- **BOPREAL agregado.** BOPREAL, organismos e intereses del BCRA vienen agregados en II.1 y no se pueden separar.
- **Hueco de planillas.** Faltan jul-2023 a may-2024 en el sitio del BCRA (404).
- **Compras del Tesoro.** No hay serie oficial pública y diaria; se muestran sin dato y no se estiman.
- **Calendario de vencimientos.** Cubre 12 meses en tres tramos, porque es lo que publica la planilla. El horizonte de 18 meses, mes a mes, no está disponible en fuentes públicas automatizables.
- **Devaluación implícita a 12 meses.** Se muestra sin dato hasta la sección 3 (futuros A3).
- **Credenciales de A3.** Existe un secret `MAE_API_KEY` (API MarketData de A3, ex MAE). Su cobertura para curvas e historia de soberanos se evalúa en el PR C1.
