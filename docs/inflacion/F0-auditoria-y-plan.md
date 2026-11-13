# Módulo de Inflación avanzado — F0: auditoría, inventario de fuentes y plan técnico

Estado al 13/11/2026. Este documento no cambia código: fija qué datos existen, cómo se construyen las métricas y en qué orden se implementan. **Requiere OK antes de F1.**

---

## 1. Resumen

- Todas las métricas de M1–M3 se pueden construir con datos públicos de INDEC: hay precios por apertura × región **y** ponderadores por división/grupo/clase × región. La reconciliación con el headline es factible.
- INDEC sigue con el IPC base dic-2016 (canasta ENGHo 2004/05); el cambio de canasta está postergado sin fecha. El pipeline queda preparado para un corte de serie.
- Las aperturas publicadas **no cubren toda la canasta**: se completan con ítems "resto de división" derivados con los ponderadores.
- Breakeven (M4): hay precios gratuitos de LECAP/BONCAP/Boncer (ByMA), pero sin condiciones de emisión ni histórico. Requiere una tabla de especies mantenida a mano y la serie arranca el día que empezamos a guardar (salvo que encontremos histórico, ver §6).
- Pipeline propuesto: **Python en GitHub Actions** → JSON versionado en el repo → Next.js solo lee. Justificación en §4.

---

## 2. Auditoría del repo

| Aspecto | Hoy |
|---|---|
| Stack | Next.js 16.1 (App Router), React 19, TypeScript 5.7, Tailwind 3.4, Recharts 2.13 |
| Ingesta | `fetch` server-side con ISR (`revalidate` 1 h; página 30 min). Sin base de datos. Algunas páginas (Mercado/FX) piden datos desde el navegador |
| Caché auxiliar | `@vercel/kv` con fallback a última copia válida — **inactivo** (no hay `KV_REST_API_*` en Vercel) |
| Jobs programados | GitHub Action `mae-fetch.yml` (cada 15 min, commitea `public/data/mae-snapshot.json` con `[skip vercel]`); `revalidate.yml` llama a `/api/cron/revalidate` |
| Gráficos | Recharts. Componentes: `HistoricalChart`, `SeasonalChart`, `RatioChart`, `MultiSeriesChart` (local en Inflación) |
| UI | `DeltaKPICard` (delta en pp, badge "desactualizado", formato de mes), `BlockSection`, `PeriodSelector` con marcadores por gobierno (`lib/bcra/constants.ts`) |
| Tests / lint | Sin tests. `npm run lint` usa `next lint`, eliminado en Next 16 |
| Bug detectado | `lib/byma/client.ts` lee solo la página 1 de 6 de `public-bonds` (ve solo especies A–B). Se corrige en F1 |

Convenciones a mantener: tema oscuro, tarjetas con delta en pp y fecha "Oct 26", selector de período + gobiernos, fuente y fecha visibles en cada bloque.

---

## 3. Inventario de fuentes (verificadas el 13/11/2026)

### 3.1 Precios (INDEC)

| Fuente | URL / acceso | Formato | Cobertura | Último dato | Estado |
|---|---|---|---|---|---|
| IPC divisiones, categorías, bienes/servicios | `indec.gob.ar/ftp/cuadros/economia/serie_ipc_divisiones.csv` | CSV `;`, Latin-1, decimal coma | Nacional + 6 regiones; nivel general, 12 divisiones, núcleo/regulados/estacional, bienes/servicios; índice, m/m, i.a. | **oct-26** | ✅ Ya en producción (PR #1) |
| IPC aperturas | `.../serie_ipc_aperturas.csv` | CSV, 1,25 MB | **Solo regiones** (sin Nacional). Divisiones + grupos + clases seleccionados. Hojas: 27 por región (29 en GBA) | **oct-26**, desde dic-16, sin huecos | ✅ Verificado |
| Ponderadores | `.../ponderadores_ipc.xls` ("Estructura de ponderaciones regionales del IPC. Diciembre de 2016") | XLS (BIFF) | División → grupo → clase, por región | Fijo (dic-16) | ✅ Existe y tiene el nivel de detalle necesario. Valores a extraer en F1 (el navegador no puede parsear XLS; lo hace el pipeline) |
| Peso de cada región en el Nacional | Informe técnico IPC | — | GBA 44,7 · Pampeana 34,2 · NEA 4,5 · NOA 6,9 · Cuyo 5,2 · Patagonia 4,6 | Fijo | ✅ A cruzar con el XLS |
| Precios promedio de productos | Informe técnico mensual (cuadro de precios medios GBA/regiones) | Por verificar | — | — | ⏳ F1 |
| Canasta / metodología | `metodologia_ipc_nacional_2019.pdf` (Metodología N° 32) | PDF | Fórmula, ponderadores ENGHo 2004/05 actualizados por precios a dic-15 | — | ✅ Referencia |

**Cambio de canasta.** INDEC anunció el IPC con ENGHo 2017/18 para ene-2026 y luego lo postergó; hoy se publica con la metodología vigente. Si se implementa, cambian aperturas y ponderadores: el pipeline versiona los ponderadores por vigencia y corta las métricas de distribución en la fecha del cambio.

### 3.2 Expectativas, tasas y mercado

| Fuente | Acceso | Último dato | Estado |
|---|---|---|---|
| REM (mes corriente, t+1, 12 m, años) | BCRA `relevamiento-expectativas-mercado-historico.xlsx`, hoja "Base de Datos Completa" | relevamiento **oct-26** | ✅ En PR #1 |
| UTDT 12 m (promedio) | CIF-UTDT "Informes EI" (HTML, desde jun-23) + datos.gob.ar para el histórico anterior | **oct-26** (35,9 %) | ✅ En PR #1 |
| Tasas: BADLAR (7), TAMAR (44), call (148), pases entre terceros (150), PF 30 d (12), TM20 (8) | API BCRA v4, diarias | **11/11/26** | ✅ En PR #1 |
| Tasa de política monetaria (IDs 160/161) | API BCRA v4 | **10/07/2025** | ❌ Discontinuada. Reemplazada por TAMAR + pases en PR #1 |
| A3500 mayorista | API BCRA v4 ID 5 | 12/11/26 | ✅ |
| CER | API BCRA v4 (ID a confirmar) / datos.gob.ar `94.2_CD_D_0_0_10` (cortado oct-24) | — | ⏳ Confirmar ID en BCRA en F1 |
| LECAP / BONCAP / Boncer | ByMA `open.bymadata.com.ar` (gratuita, paginada: 6 págs. bonos, 2 letras) | Intradía | ⚠️ Precios sí; **sin** valor final de LECAP/BONCAP, CER inicial ni cronograma de Boncer, **sin histórico** |

Especies vistas hoy: LECAP S30N6, S29E7, S26F7; BONCAP T15E7, T30A7, T30J7, T31Y7; Boncer TZXD6, TZX27, TZXM7, TZXA7, TZXY7, TZXS7, TZXO7, TZXD7, TZXM8, TZX28, TZXS8, TZXD8, TZXM9, TX28, TX31, DICP, PARP, CUAP; letras CER X30N6, X29E7.

### 3.3 Salarios y CABA

| Fuente | Acceso | Último dato | Estado |
|---|---|---|---|
| Índice de salarios INDEC | datos.gob.ar `149.1_TL_INDIIOS_OCTU_0_21` (+ registrado/privado/público) | jul-26 | ✅ (INDEC directo puede estar 1 mes adelante: verificar en F1) |
| RIPTE | datos.gob.ar `158.1_REPTE_0_0_5` **sin datos** | — | ❌ Hay que tomarlo de la Secretaría de Trabajo. Verificar en F1 |
| IPCBA (CABA) | estadisticaciudad.gob.ar | — | ⏳ El sitio no respondió (timeout). Reintentar en F1 |

---

## 4. Arquitectura propuesta

```
GitHub Actions (cron)                    Repo                         Vercel / Next.js
┌────────────────────────┐   commit   ┌──────────────────────┐   import  ┌───────────────┐
│ pipeline/ (Python)     │ ─────────▶ │ data/inflacion/*.json│ ────────▶ │ páginas leen   │
│ fetch → validar →      │ [skip ci]  │ + manifest.json      │           │ JSON estático  │
│ calcular → exportar    │            │ (versión, fechas,    │           │ (sin cálculo   │
└────────────────────────┘            │  checks, hashes)     │           │  en el cliente)│
```

- **Por qué Python:** X-13ARIMA-SEATS (binario del Census vía `statsmodels`), STL, OLS con errores HAC para pass-through, Nelson-Siegel. Reimplementarlo en TypeScript es riesgo metodológico sin beneficio.
- **Por qué JSON en el repo:** los datos son públicos, el versionado queda en git (diff por publicación de INDEC) y el deploy no depende de que Vercel llegue a cada fuente en runtime.
- **Refresh:** cron diario a las 16:30 ART (después de la publicación de INDEC) y 18:30 ART; el pipeline detecta si hay período nuevo y solo commitea si cambió algo. Cron aparte cada día hábil para precios de bonos (snapshot que construye el histórico de breakeven).
- **Validaciones bloqueantes:** si falla un check (§5.5), no se commitea y la Action queda en rojo; la web sigue mostrando la última versión válida.

---

## 5. Decisiones metodológicas (a validar)

### 5.1 Ítems y ponderadores
- **Ítem** = hoja de aperturas × región (≈ 27 × 6 + 2 = 164) **más** un ítem "resto de división" por división × región, cuyo índice se deriva del índice de la división menos lo cubierto por las aperturas publicadas, con los ponderadores del XLS. Así la canasta queda cerrada y el headline es reconstruible.
- **Ponderador nacional:** w_i = W_región × w_{i|región}.
- **Ponderadores efectivos:** el IPC es tipo Laspeyres con base fija, así que el peso que pesa en el mes t es w_{i,t} = w_{i,0} · I_{i,t−1} / I_{t−1} (actualizado por precios relativos). Se usan estos, no los de base.
- **Reconciliación:** headline recomputado vs. publicado, tolerancia propuesta **±0,05 pp m/m** en el Nacional y ±0,1 pp por región (el redondeo de INDEC es a 1 decimal). Se reporta el desvío de cada mes.

### 5.2 Distribución (M1/M2)
- Media recortada y mediana ponderadas sobre la distribución de π_{i,t} con ponderadores acumulados; recorte 10 % por cola, configurable.
- Todas las métricas de M2 en versión ponderada y sin ponderar; sobre series originales y desestacionalizadas.
- **Galicia:** sus barras se mueven en escalones de ≈ 3,7 % = 1/27, lo que sugiere 27 aperturas **sin ponderar** (inferencia nuestra, no documentada por Galicia). La versión sin ponderar a 27 ítems nacionales es la que usamos para el sanity check.

### 5.3 Desestacionalización
- X-13ARIMA-SEATS sobre el log del índice de cada ítem, con detección de outliers. Muestra corta (dic-16 → hoy, ~118 meses) y quiebre de régimen 2023-24: se prueban especificaciones con outliers/rampas y se documentan. Fallback: STL robusto.

### 5.4 Breakeven (M4)
- Curva nominal: LECAP/BONCAP (tasa efectiva desde precio y pago final). Curva real: Boncer (TIR real con CER proyectado al rezago de 10 días hábiles).
- Con pocos nodos nominales (3–4 letras + 4 BONCAP) se usa **Nelson-Siegel** (4 parámetros); Svensson se descarta por sobreajuste.
- Breakeven a 3, 6 y 12 meses = (1+i_nom)/(1+r_real) − 1, con ajuste por el rezago del CER documentado.

### 5.5 Validaciones (todas las fases)
- Ponderadores que suman 1 (por región y nacional), sin huecos en fechas, fechas alineadas entre fuentes, outliers marcados (|z| > 4 en π_{i,t}).
- Tests unitarios con paneles sintéticos: rotación perfecta → C(k) ≈ 100 % y VR < 1; shock persistente en un subconjunto → VR > 1; todos iguales → D indefinido sin romper.

---

## 6. Riesgos y limitaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Cambio de canasta de INDEC | Rompe series de aperturas y ponderadores | Ponderadores versionados por vigencia; métricas de distribución cortadas en la fecha |
| Granularidad (27 aperturas por región) | La difusión es "gruesa" (escalones de ~0,6 % con 164 ítems; ~3,7 % con 27) | Mostrar n de ítems en cada métrica; no sobreinterpretar |
| Ítems "resto de división" | Son residuos derivados; pueden ser ruidosos | Marcarlos y permitir excluirlos en M2 |
| Breakeven sin histórico | La serie arranca al empezar a guardar snapshots | Buscar histórico (BYMA histórico, A3/MAE, precios de cierre publicados) en F5 |
| Tabla de especies (LECAP/Boncer) manual | Error de carga = breakeven mal | Cargar desde los comunicados de licitación de Finanzas, con link a la fuente por especie y check de TIR vs. mercado |
| Fuentes que bloquean IPs de Vercel/GitHub | Falla de refresh | Validación bloqueante + última versión válida; alerta en la Action |

---

## 7. Plan por fase

| Fase | Contenido | Modelo / esfuerzo recomendado |
|---|---|---|
| F1 | Pipeline Python, ingesta (aperturas, ponderadores, divisiones, REM, UTDT, BCRA, ByMA paginado, salarios, IPCBA), almacenamiento JSON, crons, validaciones, reconciliación, tests sintéticos | Opus 5.5 · high |
| F2 | M2 difusión y rotación (D, buckets, C(k), A(k), VR, persistencia, heatmap, cuadrante de régimen) | **Fable 5.2 · high** |
| F3 | M1 nivel y tendencia (anualizados, SA, recortada/mediana, sticky/flexible) + "desactualizado" según frecuencia de cada serie | Opus 5.5 · high |
| F4 | M3 precios relativos (gap desde ancla, deuda relativa, B/S, regulados, transables) | Opus 5.5 · high |
| F5 | M4 expectativas y mercado (breakeven, sesgo REM, tasa real ex-ante) | **Fable 5.2 · high** |
| F6 | M5 drivers (pass-through, salario real) + "Lectura del mes" | Opus 5.5 · high |

## 8. Preguntas abiertas

1. ¿OK con Python en GitHub Actions y JSON versionado en el repo?
2. Tolerancia de reconciliación: ¿±0,05 pp m/m te parece bien?
3. Breakeven sin histórico: ¿arrancamos guardando snapshots desde F1 (aunque M4 se haga en F5) para ganar historia?
