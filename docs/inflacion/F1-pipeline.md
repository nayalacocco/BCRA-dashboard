# F1 — Pipeline de datos de inflación: nota metodológica

Estado al 13/11/2026 · último período INDEC: **oct-2026**.

## Qué produce

`data/inflacion/` (JSON versionado; lo regenera `.github/workflows/inflacion-pipeline.yml`):

| Archivo | Contenido |
|---|---|
| `items.json` | 218 ítems: 164 aperturas publicadas (27 por región, 29 en GBA) + 54 "resto de división". Región, código, división, ponderador regional y nacional |
| `panel_indices.json` | Índice de cada ítem (base dic-2016 = 100), dic-16 → oct-26, sin huecos |
| `headline.json` | Publicados por INDEC (Nacional): nivel general, núcleo, regulados, estacional, bienes, servicios (índice, m/m, i.a.) |
| `reconciliacion.json` | m/m publicado vs. recomputado, Nacional y por región |
| `manifest.json` | Fuentes (URL, sha256), último período, resultado de cada check, ítems imputados, advertencias |
| `data/bonos/AAAA/AAAA-MM-DD.json` | Foto diaria de LECAP/BONCAP/Boncer/letras CER (ByMA), desde que se mergea |

## Construcción del panel

1. **Ítems publicados.** Hojas del árbol de `serie_ipc_aperturas.csv` en cada región.
2. **Ponderadores.** `ponderadores_ipc.xls` (dic-2016), por división/grupo/clase y región. Si una apertura no figura con su código exacto, se toma el del padre (p. ej. `06.4.1` → `06.4`).
3. **Canasta cerrada.** Para cada división × región, lo no cubierto por aperturas se agrega como ítem residual:
   `I_resto,t = (w_d·I_d,t − Σ w_i·I_i,t) / (w_d − Σ w_i)`.
   Si lo no cubierto es < 1 % del peso de la división (redondeo de la tabla), no se crea residual y se reescalan los pesos.
4. **Peso nacional.** ω_i = W_r · w_{i|r}. Los pesos regionales publicados (44,7 / 34,2 / 4,5 / 6,9 / 5,2 / 4,6) suman 100,1 % por redondeo y se normalizan.
5. **Peso efectivo del mes t.** ω_{i,t} = ω_i · I_{i,t−1} / Σ ω_j · I_{j,t−1}. Con esto, π_t = Σ ω_{i,t} π_{i,t} reproduce la variación de un índice de base fija.
6. **Faltantes.** Abr–jul 2020 (cuarentena) INDEC no publicó Prendas (abr) ni Restaurantes (abr–jul). Se imputan con la variación de su división, el mismo criterio de imputación al agregado superior. Quedan listados en `manifest.imputados`.

## Validación (corrida del 13/11/2026)

| Check | Resultado | Bloqueante |
|---|---|---|
| Ponderadores suman 1 por región; regiones suman 1 | OK | Sí |
| Fechas alineadas, sin huecos ni faltantes (post-imputación) | OK — oct-26 en ambos archivos | Sí |
| **Reconciliación del headline** (ene-17 → oct-26) | **Nacional: máx 0,016 pp, mediana 0,0013 pp** (tol. 0,05) · Regiones: máx 0,038 pp (tol. 0,10) | Sí |
| Divisiones cubiertas solo por aperturas (test independiente) | 12 casos, máx 0,008 pp | No |
| Outliers (\|z robusto\| > 4) | Marcados; ninguno en el último mes | No |

**Qué valida y qué no.** En las divisiones con residual la igualdad división = Σ componentes vale por construcción, así que la reconciliación del headline valida la *estructura de agregación* (ponderadores, pesos regionales, fórmula de base fija), no cada apertura. El test independiente son las 12 divisiones × región que las aperturas cubren por completo: ahí la suma de aperturas replica la división publicada con desvío máximo de 0,008 pp.

## Sanity check contra Banco Galicia

Hipótesis: Galicia usa las **27 aperturas comunes a las 6 regiones, a nivel nacional y sin ponderar** (las barras se mueven en escalones de 1/27 ≈ 3,7 %). Resultado (variante A del pipeline):

| Bucket m/m | Oct-26 Galicia (lectura del gráfico) | Oct-26 pipeline |
|---|---|---|
| < 0 % | 0 | 0,0 |
| 0–0,5 % | ≈ 11,1 | 7,4 |
| 0,5–1 % | 0 | 3,7 |
| 1–1,5 % | ≈ 18,5 | 18,5 |
| 1,5–2 % | ≈ 25,9 | 25,9 |
| 2–2,5 % | ≈ 18,5 | 18,5 |
| 2,5–3 % | ≈ 11,1 | 11,1 |
| 3–3,5 % | ≈ 7,4 | 7,4 |
| > 5 % | ≈ 7,4 | 7,4 |
| **< 2 %** | **≈ 55,6** | **55,6** |

Coincide en 10 de 11 buckets; la única diferencia es un ítem en el borde 0,5 % (probablemente Galicia usa variaciones redondeadas a un decimal). Mar-26 coincide en todos los buckets y sep-26 difiere en un ítem. **Nota:** en oct-26 el gráfico muestra ≈ 56 % de precios con suba < 2 %, no 45 %.

La métrica del dashboard (variante C: 218 ítems ponderados) da 58,0 % para oct-26.

## Refresh

- INDEC: días hábiles 16:40 y 18:40 ART. Si no hay período nuevo, no hay commit. Si cambia, commit `chore(data): inflación INDEC AAAA-MM` → Vercel redeploya.
- Bonos: días hábiles 18:15 ART, commit con `[skip vercel]`.
- Si falla un check bloqueante, la Action queda en rojo y no se escribe nada: la web sigue con la última versión válida.

## Limitaciones conocidas

- 27 aperturas por región: la difusión es "gruesa". Con 218 ítems ponderados el escalón mínimo es mucho menor, pero los residuales son derivados y pueden ser ruidosos.
- Los ponderadores son de dic-2016 (ENGHo 2004/05). Si INDEC cambia la canasta, hay que versionar ponderadores y cortar series.
- Pospuesto a las fases que los usan: índice de salarios y RIPTE (F6), CER (F5), IPCBA y precios promedio (opcionales, F3/F4).
