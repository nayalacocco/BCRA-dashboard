# F2 — Difusión y rotación (M2): nota metodológica

Estado al 13/11/2026 · último período INDEC: **oct-2026** · página: `/inflacion/difusion`.

## Pregunta que responde

¿La inflación del mes la explican muchos precios o unos pocos? ¿Los rubros que lideran se turnan (inercia) o son siempre los mismos (cambio de precios relativos)? De eso depende cuánto de la variación mensual es extrapolable, que es el insumo para comparar CER contra tasa fija.

## Qué produce

`pipeline/inflacion/difusion_export.py` (lo llama `run.py` después de F1) escribe en `data/inflacion/`:

| Archivo | Contenido |
|---|---|
| `difusion.json` | 12 variantes (`universo.ponderación.serie`): D, tramos, C(k), C\*(k), A(k), VR(k) y su banda, ρ, régimen |
| `heatmap.json` | r_{i,t} por ítem (Nacional y 6 regiones; original y desestacionalizada). Se sirve por `/api/inflacion/heatmap` y se carga solo al abrir el mapa |
| `desest.json` | Por ítem: p-valor del test de estacionalidad y si se ajustó |

Todo se calcula en el pipeline; el cliente solo filtra y dibuja.

## Definiciones

Sea π_{i,t} la variación mensual del ítem i, π_t la del nivel general recomputado con el mismo universo, y ω_{i,t} el peso efectivo (ω_i · I_{i,t−1}, normalizado). Precio relativo: **r_{i,t} = ln(1+π_{i,t}) − ln(1+π_t)**.

| Métrica | Fórmula | Lectura |
|---|---|---|
| Difusión D_t | Σ ω_{i,t} · 1[r_{i,t} > 0] | % de la canasta que sube más que el promedio. ~50 % = distribución simétrica; bajo = pocos rubros traccionan |
| Tramos | % de la canasta con π_{i,t} en <0, 0–0,5, …, 4–5, >5 | Réplica del gráfico de Galicia, ponderada |
| Rotación C_t(k) | Σ ω_i · 1[r_i > 0 en algún mes de la ventana k] | % de la canasta que lideró al menos una vez |
| Referencia C\*_t(k) | 1 − Π_{s}(1 − D_s) | Lo que daría C(k) si liderar un mes fuera independiente de haber liderado otro. C < C\* ⇒ lideran los mismos |
| Acumulada A_t(k) | Σ ω_{i,t−k} · 1[R_i(k) > 0], R = Σ r | % de la canasta que le ganó al promedio en la ventana. Pesos al inicio de la ventana (identidad de Laspeyres exacta) |
| Variance ratio VR_t(k) | Var_cs(Σ_{s} r_{i,s}) / (k · media_s Var_cs(r_{i,s})) | <1: los precios relativos revierten; >1: persisten. Identidad: VR − 1 = 2·ΣCov / ΣVar |
| Persistencia ρ_t | corr. ponderada de corte transversal entre r_{i,t} y r_{i,t−1}; medias móviles 6 y 12 | Signo y fuerza de la autocorrelación de precios relativos |

Ventanas k = 3, 6, 12.

### Variantes

- **Universo**: `todos` (218 ítems: aperturas × región + restos de división, reconcilia con el nivel general), `publicados` (164, sin restos), `nacional27` (27 aperturas del total país, el universo del gráfico de Galicia).
- **Ponderación**: por participación en la canasta, o simple (cada ítem pesa igual).
- **Serie**: original o desestacionalizada.

Default: `todos.pond.orig`.

### Banda de referencia del VR

En muestras finitas VR(k) no vale 1 ni siquiera sin memoria. La banda [p5, p95] se obtiene con 300 réplicas en las que a cada mes se le invierte el signo de r al azar (semilla fija): conserva la dispersión de cada mes y rompe la dependencia temporal.

Alternativa descartada: permutar los meses. Conserva la deriva propia de cada ítem (un rubro que se atrasa todo el período sigue atrasado en cualquier orden), con lo que la banda queda centrada en el VR observado y no discrimina.

### Desestacionalización

STL robusto sobre Δln del índice de cada ítem (período 12, ventana estacional 7), solo si el test de Kruskal-Wallis por mes calendario da p < 0,01. El componente estacional se normaliza a suma ≈ 0 por año móvil para que el ajuste no cambie el nivel. Agregación indirecta: el nivel general desestacionalizado es el agregado de los ítems ajustados.

Se ajustan 57 de 218 ítems. Alternativas descartadas: X-13 (binario externo, frágil en CI y con series de 118 meses bajo cambios de régimen), ajustar todos los ítems (introduce ruido donde no hay estacionalidad), ajuste directo del nivel general (rompe la consistencia entre ítems y agregado).

### Régimen del mes

Reglas explícitas, en `difusion.py::componentes`:

- **Amplitud**, sobre D̄ (promedio de 3 meses de D): concentrada si D̄ < 40 %, generalizada si D̄ ≥ 45 %, intermedia en el medio.
- **Dinámica**, sobre VR(3), su banda y el exceso C(3) − C\*(3): rotación si VR(3) < p5, o VR(3) < 1 y C(3) > C\*(3); persistencia si VR(3) > p95, o VR(3) > 1 y C(3) < C\*(3); ruido en otro caso.

| | Rotación | Persistencia |
|---|---|---|
| **Generalizada** | Generalizada y escalonada (inercia) | Generalizada con cambio persistente de precios relativos |
| **Concentrada** | Shock concentrado que revierte | Shock concentrado y persistente |

Cualquier otra combinación: "sin señal clara". La tarjeta muestra además en cuántas de las 12 variantes se repite la amplitud y la dinámica del mes.

## Validación

**Tests sintéticos** (`pipeline/tests/test_difusion.py`, 10 casos; 17 con los de F1):

| Caso | Esperado | Resultado |
|---|---|---|
| Rotación perfecta (cada ítem lidera un mes por turno) | C(k) ≈ 100 %, VR < 1 | ✔ |
| Shock persistente (un subconjunto lidera siempre) | VR > 1, C(k) < C\*(k) | ✔ |
| Todos los ítems iguales | D indefinida, sin división por cero | ✔ (se devuelve `null`) |
| Ruido i.i.d. | VR dentro de la banda | ✔ |
| D ponderada vs. simple | difieren según los pesos | ✔ |
| Acumulada con pesos de inicio de ventana | identidad exacta | ✔ |
| Identidad VR − 1 = 2ΣCov/ΣVar | exacta | ✔ |
| Reglas de régimen | tabla | ✔ |
| Desestacionalización de una serie con patrón conocido | lo remueve; no toca la que no lo tiene | ✔ |
| Normalización estacional | suma ≈ 0 por año | ✔ |

**Reconciliación**: sin cambios respecto de F1 (máx. 0,016 pp nacional).

**Contraste con el gráfico de Galicia**: con `nacional27.simple.orig`, el universo y la ponderación del gráfico, oct-26 da 55,5 % de aperturas con suba menor a 2 % (el gráfico muestra ≈ 56 %). La versión ponderada con 218 ítems da 58,0 %.

## Resultado oct-2026

| Variante | D | D̄(3) | <2 % | C(3) | C\*(3) | VR(3) | VR(12) | Amplitud | Dinámica |
|---|---|---|---|---|---|---|---|---|---|
| todos · pond. · orig. | 35,7 | 45,9 | 58,0 | 77,3 | 84,9 | 1,71 | 1,47 | generalizada | persistencia |
| todos · simple · orig. | 32,1 | 44,0 | 61,5 | 79,8 | 83,3 | 1,66 | 1,14 | intermedia | persistencia |
| publicados · pond. · orig. | 36,7 | 46,6 | 56,5 | 77,3 | 85,5 | 1,87 | 1,64 | generalizada | persistencia |
| publicados · simple · orig. | 29,9 | 44,9 | 63,4 | 79,3 | 84,6 | 1,69 | 1,80 | intermedia | persistencia |
| nacional27 · pond. · orig. | 28,5 | 45,6 | 59,6 | 71,0 | 85,9 | 2,20 | 1,88 | generalizada | persistencia |
| nacional27 · simple · orig. | 33,3 | 50,6 | 55,5 | 77,8 | 89,8 | 1,94 | 1,83 | generalizada | persistencia |
| todos · pond. · desest. | 31,3 | 44,1 | 51,2 | 74,4 | 83,3 | 1,93 | 2,04 | intermedia | persistencia |
| todos · simple · desest. | 28,4 | 37,3 | 59,6 | 66,5 | 75,8 | 1,88 | 1,52 | concentrada | persistencia |
| publicados · pond. · desest. | 31,0 | 44,1 | 50,2 | 75,6 | 83,4 | 1,94 | 2,20 | intermedia | persistencia |
| publicados · simple · desest. | 28,0 | 38,0 | 58,5 | 67,1 | 76,8 | 1,89 | 2,36 | concentrada | persistencia |
| nacional27 · pond. · desest. | 25,1 | 44,0 | 50,5 | 70,0 | 84,1 | 2,29 | 2,78 | intermedia | persistencia |
| nacional27 · simple · desest. | 29,6 | 39,5 | 51,8 | 63,0 | 78,4 | 2,23 | 2,56 | concentrada | persistencia |

Banda de VR(3) en la variante default: 0,70–1,33.

Lectura: la **dinámica es robusta** (persistencia en 12 de 12 variantes; VR(3) por encima de la banda y C(3) por debajo de la referencia en todas). La **amplitud no lo es**: generalizada en 4, intermedia en 5, concentrada en 3. D̄(3) está sobre el umbral en casi todas las variantes ponderadas y el dato puntual de octubre (D entre 25 % y 37 %) es más concentrado que el promedio trimestral.

## Limitaciones

1. **Granularidad.** INDEC publica 27 aperturas por región, no los ~300 productos. Un D de 36 % sobre aperturas no es comparable con difusiones calculadas sobre productos (BCRA, consultoras con relevamiento propio).
2. **Ítems "resto de división".** Se obtienen por diferencia y concentran el error de redondeo de los índices publicados; en divisiones chicas son ruidosos. Por eso existe el universo `publicados`.
3. **Las seis regiones no son independientes.** La misma apertura en seis regiones se mueve casi igual; el universo de 218 ítems tiene bastante menos de 218 grados de libertad. La banda del VR no corrige esto.
4. **Umbrales heurísticos.** 40 % y 45 % no salen de un modelo. En la historia 2017–2026 la variante default clasifica 58 de 118 meses como "sin señal clara" (incluye los dos primeros, sin ventana completa).
5. **Revisión de la serie desestacionalizada.** Cada dato nuevo recalcula el STL de toda la serie: los valores desestacionalizados de meses anteriores cambian. No se guarda vintage.
6. **Estacionalidad bajo cambios de régimen.** Con 118 meses y dos episodios de inflación de tres dígitos anuales, el patrón estacional estimado es poco preciso; el filtro p < 0,01 es conservador a propósito.
7. **Ponderadores de 2004/05.** Los pesos base son los de la ENGHo 2004/05 actualizados por precios relativos; subponderan servicios respecto del consumo actual.

## Riesgos de interpretación

- **"Persistencia" es el estado más frecuente, no una señal rara.** VR(3) quedó por encima de la banda en 37 de 116 meses (32 %; el azar daría 5 %) y por debajo en 6. En Argentina los precios relativos tienen deriva de varios años (indumentaria atrasada, regulados que se corrigen por etapas), y esa deriva alcanza para dar VR > 1. Persistencia en un mes no implica un shock nuevo.
- **VR < 1 no es solo rotación económica.** Estacionalidad no removida y ruido de medición también generan reversión. Comparar siempre con la serie desestacionalizada.
- **D bajo no es desinflación.** Mide asimetría de la distribución, no nivel: un mes de 2 % y uno de 20 % pueden tener el mismo D.
- **El régimen describe, no pronostica.** No está testeado como predictor de la inflación siguiente; no debería entrar solo en una decisión CER vs. tasa fija. Ese cruce es el objeto de F5.
- **La amplitud de oct-26 depende de la variante.** Cualquier lectura que dependa de "generalizada" vs. "concentrada" este mes hay que darla con la tabla de arriba, no con la etiqueta.

## Cómo correrlo

```bash
cd pipeline
python -m pytest -q tests
python -m inflacion.run --out ../data/inflacion            # F1 + F2
python -m inflacion.difusion_export --data ../data/inflacion  # solo F2, sobre datos ya generados
```
