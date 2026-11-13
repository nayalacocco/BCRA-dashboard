# Metodología de /inflacion/difusion: nulls, umbrales, validación y precios relativos con anclas

Estado al 13/11/2026 · último período INDEC: **oct-2026**.

Criterio general: solo se agrega detalle si la información es confiable y si la conclusión que permite suma al análisis o sirve para estimar.

## 1. Null por permutación para C(k) y VR(k)

**Construcción.** 2000 réplicas. En cada una, dentro de cada ítem, se permutan al azar los años de r_i,t dentro de cada mes calendario (`pipeline/inflacion/nulo.py`). Para cada mes t se informan p5, p50 y p95 de C_t(k) y VR_t(k). Los ponderadores efectivos son los observados. Todo se precomputa en el pipeline: unos 70 s para las 12 variantes.

Qué conserva cada rubro y qué rompe:
- Conserva su estacionalidad (los eneros siguen siendo eneros), su deriva media 2017–2026 y su volatilidad.
- Rompe la dependencia entre meses consecutivos, que es lo que miden C y VR.

**Por qué no bootstrap por bloques de 12 meses.** Un bloque de 12 meses conserva la autocorrelación dentro del bloque, que es justamente lo que miden VR(3), VR(6) y VR(12). El null reproduciría el valor observado y no tendría poder.

**Por qué no 1 − Π(1 − D) (aproximación descartada).** Supone que cualquier ítem tiene la misma probabilidad de superar al nivel general cada mes. Con ítems heterogéneos la cobertura esperada es menor, así que la fórmula la sobreestima. En la variante por defecto la diferencia con la mediana del null es +1,5 pp en promedio y +3,8 pp en oct-26 (84,9 % vs. 81,1 %). En la página queda solo en Metodología.

**Cómo se lee.** "Persistencia" significa persistencia más allá de la deriva media de cada rubro en toda la muestra:
- Una deriva constante de diez años no cuenta como señal (test `test_deriva_constante_no_es_senal`).
- Un episodio sí, por ejemplo un congelamiento seguido de una recomposición (test `test_shock_persistente_episodio`).

**Calibración.** Con paneles de ruido puro del mismo largo que la muestra (118 meses), el valor observado cae dentro de p5–p95 en torno al 84 % de los meses, contra un 90 % nominal. Con 10 años por mes calendario el null queda algo angosto, así que los falsos positivos rondan el 16 % y no el 10 %.

**Regla de dinámica (régimen).**
- Persistencia: VR(3) > p95 o C(3) < p5.
- Rotación: VR(3) < p5 o C(3) > p95.
- Si no sale de ninguna banda, o si las dos señales se contradicen: "sin patrón distinguible del azar".

## 2. Umbrales de amplitud

Pasan a ser los terciles de la distribución histórica de D̄ (3 meses) de cada variante. Antes eran 40 y 45 % fijos, elegidos a ojo.

D cae estructuralmente bajo 50 %: la distribución de variaciones es asimétrica a la derecha y pocos rubros con subas grandes tiran el promedio para arriba. Un umbral fijo no es neutro. Con terciles, cada categoría tiene la misma frecuencia histórica.

Terciles de la variante por defecto: 42,1 y 46,2 %. El conteo de robustez usa los terciles propios de cada variante.

## Antes y después: conclusión de oct-26

**Antes:** "Generalizada con cambio persistente de precios relativos". La dinámica coincidía en 12 de 12 variantes; la amplitud, en 4 de 12.

**Ahora:** "Sin señal clara". La amplitud es intermedia (D̄ = 45,9 %, en el tercio central). La dinámica sigue siendo persistencia: VR(3) = 1,71, por encima del p95 del null (1,36). La dinámica coincide en 12 de 12 variantes y la amplitud en 9 de 12.

Lo que cambia es la amplitud. La persistencia era robusta y lo sigue siendo con el null más exigente.

| Variante | Antes: amplitud · dinámica | Ahora: amplitud · dinámica | D̄(3) | Terciles | C(3) | Null C(3) p5–p95 | VR(3) | Null VR(3) p5–p95 |
|---|---|---|---|---|---|---|---|---|
| todos · pond. · orig. | generalizada · persistencia | intermedia · persistencia | 45,9 | 42,1–46,2 | 77,3 | 73,2–88,2 | 1,71 | 0,82–1,36 |
| todos · simple · orig. | intermedia · persistencia | intermedia · persistencia | 44,0 | 40,5–46,9 | 79,8 | 78,0–85,8 | 1,66 | 0,97–1,41 |
| publicados · pond. · orig. | generalizada · persistencia | intermedia · persistencia | 46,6 | 41,9–46,7 | 77,3 | 72,2–88,9 | 1,87 | 0,79–1,42 |
| publicados · simple · orig. | intermedia · persistencia | intermedia · persistencia | 44,9 | 40,0–46,5 | 79,3 | 76,8–86,0 | 1,69 | 0,90–1,38 |
| nacional27 · pond. · orig. | generalizada · persistencia | intermedia · persistencia | 45,6 | 42,0–47,6 | 71,0 | 64,0–95,7 | 2,20 | 0,60–1,68 |
| nacional27 · simple · orig. | generalizada · persistencia | generalizada · persistencia | 50,6 | 39,5–46,9 | 77,8 | 74,1–96,3 | 1,94 | 0,62–1,69 |
| todos · pond. · s.e. | intermedia · persistencia | intermedia · persistencia | 44,1 | 42,3–46,7 | 74,4 | 75,0–89,2 | 1,93 | 0,79–1,35 |
| todos · simple · s.e. | concentrada · persistencia | concentrada · persistencia | 37,3 | 41,5–46,0 | 66,5 | 77,5–85,8 | 1,88 | 0,85–1,24 |
| publicados · pond. · s.e. | intermedia · persistencia | intermedia · persistencia | 44,1 | 42,2–47,0 | 75,6 | 73,4–89,5 | 1,94 | 0,76–1,41 |
| publicados · simple · s.e. | concentrada · persistencia | concentrada · persistencia | 38,0 | 40,9–46,3 | 67,1 | 76,2–86,0 | 1,89 | 0,84–1,30 |
| nacional27 · pond. · s.e. | intermedia · persistencia | intermedia · persistencia | 44,0 | 41,3–48,2 | 70,0 | 65,8–94,8 | 2,29 | 0,57–1,65 |
| nacional27 · simple · s.e. | concentrada · persistencia | intermedia · persistencia | 39,5 | 39,5–47,7 | 63,0 | 70,4–92,6 | 2,23 | 0,58–1,62 |

En la historia 2017–2026 (variante por defecto), "persistencia" pasa de 80 a 67 de 116 meses, "sin patrón" de 26 a 37, y "rotación" de 10 a 12.

## 3. Validación del universo "Canasta completa (218)"

- **Sin superposición.** En cada región hay 27 aperturas hoja (29 en GBA) y 9 "restos de división": sin duplicados, sin aperturas padre e hija a la vez y a lo sumo un resto por división. Es el check bloqueante `universo_consistente`.
- **Ponderadores.** Antes sumaban 1,0000024, fuera de la tolerancia de 1e-6: INDEC los publica con 4 decimales y en Noreste las divisiones sumaban 0,9999 y en Noroeste 1,0001. Ahora se reescalan dentro de cada región (`items.normalizar_pesos`) y suman 1 con error de 1e-16. El cambio en los pesos relativos es del orden de 1e-4.
- **Reconciliación mes a mes** (nivel general recomputado vs. publicado por INDEC), 118 meses:
  - Error máximo: 0,016 pp (feb-24). Error medio absoluto: 0,0017 pp. Ningún mes por encima de 0,05 pp, así que no hubo que frenar.
  - Los mayores desvíos (feb-24: −0,016 pp; ene-24: +0,012 pp; ene-21: +0,007 pp) caen en meses de inflación muy alta y vienen del redondeo de los índices publicados.
  - Por región, el máximo es 0,038 pp (Patagonia).

## 4. Precios relativos: anclas en lugar de fecha base

**Nivel relativo** (series desestacionalizadas): L_i,t = ln(I_i,t / I_i,dic-16) − ln(H_t / H_dic-16). El desvío se mide contra un ancla, no contra una fecha base.

**Jerarquía de anclas.**

1. **Externa o de costo: no se usa.** Inventario de lo evaluado:

| Ancla | Fuente | Frecuencia / desde | Por qué no |
|---|---|---|---|
| Electricidad: cobertura del costo de generación | CAMMESA (informes mensuales en PDF); serie de cobertura de RICSA (privada) | Mensual | INDEC publica electricidad, gas y otros combustibles en una sola apertura (04.5). No hay serie oficial descargable de cobertura |
| Gas: PIST vs. paridad de importación | Secretaría de Energía (precios de gas, datos.gob.ar); GNL/Henry Hub | Mensual | Mismo problema de agregación. No encontré una paridad pública sin registro |
| Transables: nivel vs. el mundo | Banco Mundial ICP 2021 (niveles por categoría) + CPI de EE.UU. (BLS) o IPCA de Brasil (IBGE) + tipo de cambio | ICP: 2017 y 2021; CPI mensual | El nivel ICP 2021 está medido al tipo de cambio oficial en pleno cepo (brecha cercana al 100 %): distorsiona el nivel que se quiere medir. La cuña de aranceles no tiene serie |
| Alquileres: alquiler/salario, rentabilidad | Instituto de Estadística de CABA (sobre la base de Argenprop); Index Zonaprop; Índice de salarios de INDEC | Trimestral, 2016– | Solo CABA, en PDF; la apertura es nacional |

2. **Historia filtrada por régimen (la que se usa).** Promedio de L en los meses sin cepo cambiario: ene-2017 a ago-2019 (el cepo vuelve con la Com. A 6770 del 1/9/2019) y desde abr-2025 (fin del cepo para personas humanas, 14/4/2025). Son 51 de 119 meses.
   - Se usa el criterio legal y no una brecha medida porque es oficial y verificable, y porque deja afuera los congelamientos tarifarios y los controles generalizados de 2019–2023.
   - El criterio de cobertura de costo para regulados no se puede aplicar sin la serie de costo.
3. **Promedio simple de toda la muestra:** solo como referencia. La distancia entre las dos anclas es la barra horizontal del gráfico.

**Tabla de anclas por ítem (27 aperturas nacionales, oct-26):**

| Apertura | Pond. | Ancla usada | Desvío vs. ancla filtrada | Desvío vs. promedio simple | Δ 6m | Ancla externa evaluada |
|---|---|---|---|---|---|---|
| Calzado | 3,1 % | Historia filtrada (sin cepo) | -23,5 % | -29,7 % | -8,9 % | Ídem prendas |
| Prendas de vestir y materiales | 8,3 % | Historia filtrada (sin cepo) | -21,5 % | -28,9 % | -9,5 % | Nivel ICP 2021 + CPI EE.UU./Brasil: descartada (PLI al tipo de cambio oficial con cepo) |
| Tabaco | 2,2 % | Historia filtrada (sin cepo) | -20,7 % | -18,4 % | -3,7 % | No aplica |
| Bebidas alcohólicas | 1,8 % | Historia filtrada (sin cepo) | -19,8 % | -18,0 % | -6,0 % | No aplica |
| Servicios de telefonía e internet | 3,1 % | Historia filtrada (sin cepo) | -10,9 % | -1,8 % | -0,4 % | No aplica |
| Café, té, yerba y cacao | 0,8 % | Historia filtrada (sin cepo) | -9,9 % | -16,0 % | -5,1 % | No aplica |
| Bienes y servicios para la conservación del hogar | 4,2 % | Historia filtrada (sin cepo) | -9,6 % | -7,7 % | -1,3 % | No aplica |
| Aguas minerales, bebidas gaseosas y jugos | 2,8 % | Historia filtrada (sin cepo) | -5,8 % | -2,3 % | -2,4 % | No aplica |
| Servicios recreativos y culturales | 3,3 % | Historia filtrada (sin cepo) | -5,2 % | 4,8 % | 4,3 % | No aplica |
| Leche, productos lácteos y huevos | 4,2 % | Historia filtrada (sin cepo) | -4,9 % | -7,2 % | -3,1 % | No aplica |
| Combustibles y lubricantes para vehículos de uso del hogar | 4,9 % | Historia filtrada (sin cepo) | -4,7 % | -0,9 % | -5,6 % | No aplica |
| Pan y cereales | 5,5 % | Historia filtrada (sin cepo) | -4,6 % | -6,7 % | -1,4 % | No aplica |
| Frutas | 1,6 % | Historia filtrada (sin cepo) | -4,6 % | -11,4 % | -10,4 % | No aplica |
| Educación | 2,7 % | Historia filtrada (sin cepo) | -3,3 % | 6,5 % | 5,2 % | No aplica |
| Gastos de prepagas | 2,5 % | Historia filtrada (sin cepo) | -1,8 % | 5,6 % | 0,9 % | No aplica |
| Azúcar, dulces, chocolate, golosinas, etc. | 1,3 % | Historia filtrada (sin cepo) | -1,4 % | -5,9 % | -1,6 % | No aplica |
| Cuidado personal | 3,4 % | Historia filtrada (sin cepo) | 0,2 % | 1,4 % | -0,8 % | No aplica |
| Alquiler de la vivienda | 4,0 % | Historia filtrada (sin cepo) | 2,9 % | 31,4 % | 5,4 % | Alquiler/salario y rentabilidad (CABA): descartada (solo CABA, trimestral, PDF) |
| Aceites, grasas y manteca | 0,8 % | Historia filtrada (sin cepo) | 5,1 % | 2,9 % | -2,3 % | No aplica |
| Adquisición de vehículos | 3,1 % | Historia filtrada (sin cepo) | 7,0 % | -8,7 % | -6,9 % | CPI EE.UU. vehículos: descartada (sin ancla de nivel confiable) |
| Periódicos, diarios, revistas, libros y artículos de papelería | 1,8 % | Historia filtrada (sin cepo) | 7,3 % | 7,9 % | 2,8 % | No aplica |
| Transporte público | 3,4 % | Historia filtrada (sin cepo) | 8,3 % | 23,9 % | 6,0 % | No aplica |
| Electricidad, gas y otros combustibles | 3,3 % | Historia filtrada (sin cepo) | 9,8 % | 33,9 % | 5,7 % | Cobertura de costo (CAMMESA) / paridad gas: descartada (electricidad y gas juntos; sin serie oficial) |
| Productos medicinales, artefactos y equipos para la salud | 4,8 % | Historia filtrada (sin cepo) | 11,1 % | 1,0 % | 0,1 % | No aplica |
| Restaurantes y comidas fuera del hogar | 9,9 % | Historia filtrada (sin cepo) | 16,1 % | 19,6 % | -2,9 % | No aplica |
| Carnes y derivados | 10,3 % | Historia filtrada (sin cepo) | 20,0 % | 17,0 % | 1,6 % | No aplica |
| Verduras, tubérculos y legumbres | 3,1 % | Historia filtrada (sin cepo) | 26,9 % | 17,6 % | 43,2 % | No aplica |

**¿Sirve para estimar? Backtest.**
- Diseño: 27 aperturas nacionales, orígenes cada 6 meses de 2019-01 a 2026-01 (405 observaciones), anclas calculadas solo con datos hasta el origen. Se regresa el cambio del precio relativo en los 6 meses siguientes contra el desvío en el origen. Errores estándar agrupados por fecha de origen.

| Predictor | β | t | R² | Acierto de signo | Vida media implícita |
|---|---|---|---|---|---|
| Desvío vs. ancla filtrada | -0,11 | -1,0 | 5 % | 48 % | 35 meses |
| Desvío vs. promedio simple | -0,13 | -0,9 | 4 % | 48 % | 29 meses |
| Dirección pasada (momentum) | -0,08 | -0,4 | 1 % | 57 % | — |

- Lectura: ningún predictor es distinto de cero. En esta muestra el desvío no predijo la corrección a 6 meses; el signo es el esperado (revierte), pero con una vida media de unos 3 años y mucho ruido.
- Consecuencia: la página lo muestra como lectura de nivel, no como señal de timing, y lo dice en el subtítulo del gráfico.
- Por eso no se sumaron más anclas de menor calidad: si la mejor disponible no predice, agregar ruido no mejora la estimación.

## 5. Visualizaciones

- **a) Nivel vs. dirección** (scatter):
  - Eje X: desvío vs. ancla filtrada (punto), con una barra hasta el promedio simple.
  - Eje Y: Δ del precio relativo en 3, 6 o 12 meses (selector); no depende del ancla.
  - Tamaño = ponderador. Cuadrantes rotulados.
  - Etiquetas directas en los 8 más relevantes (ponderador × distancia); el resto, en el tooltip.
  - Los extremos aislados (verduras: +27 % / +43 %) se dibujan en el borde, marcados.
- **b) Evolución:** hasta 4 rubros, en índice con el ancla = 100 (línea punteada). Sombreado tenue por gobierno y eventos anotados (cepo sep-2019, devaluación dic-2023, fin del cepo abr-2025).
- **c) Heatmap:** se mantiene la secuencia mensual. "Acum." se reemplaza por "Vs. ancla" (historia filtrada, s.e.) y "Δ 6m". El selector de período solo cambia el rango visible.
- **d) Estacionalidad:** se mantiene STL robusto sobre Δln con ventana estacional de 7 años.
  - El quiebre de dic-2023 es un outlier de pocos meses en Δln, que la versión robusta pondera a cero.
  - La ventana de 7 años deja que el patrón cambie.
  - Se descartó X-13 con regresores de cambio de nivel: agrega un binario externo y una especificación por serie, para un beneficio que no se puede validar con menos de tres años del régimen actual.

## 6. Lectura del régimen

Se agregó la línea "Precios relativos", con los tres rubros de ponderador ≥ 1 % más alejados de su ancla y su dirección. En oct-26:
- Verduras: +26,9 % y encareciéndose.
- Calzado: −23,5 % y atrasándose.
- Prendas: −21,5 % y atrasándose.

## Limitaciones

- La serie nacional arranca en dic-2016: el ancla filtrada se apoya en 51 meses y en dos regímenes distintos (2017–2019 y 2025–2026).
- Las anclas tienen error propio. El período 2017–2019 incluye tarifas todavía en recomposición, y desde 2024 hay cambios estructurales (apertura importadora) que pueden mover el "equilibrio" de los transables.
- El nivel se muestra como rango entre anclas, no como un número exacto.
- El null deja una tasa de falsos positivos algo mayor a la nominal (~16 % vs. 10 %).
- Es una lectura descriptiva, no una proyección.

## Cómo correrlo

```bash
cd pipeline
python -m pytest -q tests                                     # 26 tests
python -m inflacion.difusion_export --data ../data/inflacion  # difusión, null y precios relativos (~70 s)
```
