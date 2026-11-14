# Sistema de diseño v5

Estética de informe institucional: el color solo transmite significado. Aplicado por ahora a `/inflacion/difusion`, al sidebar y al pie de página. El resto de las pestañas lo adopta en PRs siguientes.

Referencia visual: `argentina-dashboard-v5.html` (mockup con datos inventados; no se copió ningún valor).

## Tokens

Fuente única: `src/design/tokens.ts`. `themeCss()` genera las variables CSS (`:root[data-theme="light|dark"]`) que se inyectan en `<head>`. Los gráficos leen los mismos valores con `useTokens()`, porque Recharts dibuja con atributos SVG.

| Token | Variable | Claro | Oscuro |
|---|---|---|---|
| bg / surface | `--bg` / `--surface` | #ffffff | #0f1b2a |
| sidebar | `--sidebar` | #f5f7f9 | #0a1420 |
| rule / rule-strong | `--rule` / `--rule-strong` | #e2e6eb / #b9c2cc | #213247 / #3a4f68 |
| text / text-2 / muted | `--text` / `--text-2` / `--muted` | #14191f / #4a5360 / #87909c | #e9eef4 / #b2bfcd / #7a8a9c |
| head | `--head` | #0f2c4a | #f1f4f8 |
| celeste | `--celeste` | #6b9fcf | #8fb7de |
| serie 1–4 | `--s1`…`--s4` | #2f6ea8 / #a8801a / #1d8c72 / #9c4a3a | #5b93cc / #b08a24 / #1f957a / #c95f48 |
| barra neutra | `--neutral-bar` | #aab6c3 | #3f5872 |
| divergente | `--div-lo` / `--div-mid` / `--div-hi` | #2f6ea8 / #d5dbe2 / #9c3a35 | #5b93cc / #34465c / #cc5f58 |

Tokens auxiliares, que no transmiten significado:

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--soft` | #eef2f6 | #16263a | Hover y fondo del ítem activo |
| `--band` (+ opacidad) | `--muted` al 12 % | `--muted` al 16 % | Franjas de referencia en gris tenue |

En Tailwind: `text-ds-head`, `bg-ds-sidebar`, `border-ds-rule`, etc. (`tailwind.config.ts`, grupo `ds`). No admiten modificador de opacidad (`/50`).

**Escala divergente.** `diverging(t, x)` y `divergingSteps(t, nBajo, nAlto)` interpolan en RGB entre `div-lo`, `div-mid` y `div-hi`. Los tonos intermedios salen de los validados; no agregan colores de otra familia. Se usa para todo lo que sea "por debajo/por encima del nivel general": tramos de la distribución, heatmap y puntos del cuadrante.

**No agregar colores sin validarlos** (daltonismo y contraste en ambos modos).

## Tipografía

- Source Serif 4 (fallback Georgia): títulos, bajadas, lectura del régimen. Clase `font-serif`.
- Inter: texto y UI.
- Cifras tabulares: clase `tnum`.
- Versalitas (`smallcaps`) solo en encabezados de tabla, grupos del menú y eyebrow.

## Componentes (`src/components/ds/`)

| Componente | Archivo | Para qué |
|---|---|---|
| `Eyebrow` | Typography | Rótulo de sección de la página, con filete celeste corto arriba |
| `PageTitle` | Typography | Título serif |
| `Lede` | Typography | Bajada serif con la conclusión; admite `<b>` |
| `Section` | Typography | Título h2 serif + subtítulo-conclusión + slot derecho (controles locales) |
| `Block` | Typography | Contenedor con filete de 1 px color head arriba, sin fondo ni bordes |
| `Note` | Typography | Nota con filete celeste a la izquierda |
| `HowTo` | Typography | Desplegable "ⓘ Cómo se calcula" |
| `Formula` | Typography | Fórmula en estilo secundario (mono, chico, muted) |
| `Segmented` | Controls | Segmentado con el activo en color head |
| `Control` | Controls | Rótulo en minúscula + control |
| `ControlBar` | Controls | Fila única de controles, pegajosa |
| `Kpi` / `KpiStrip` | Kpi | Franja horizontal: valor, delta neutro, sparkline 12 m, línea de contexto |
| `Sparkline` | Kpi | Mini serie (text-2) con punto final |
| `ChartFrame` | Chart | Título, subtítulo-conclusión, leyenda, "Ver tabla", pie con fuente y último dato, "Cómo se calcula" |
| `Legend` | Chart | Leyenda arriba (línea, punteada, bloque, banda) |
| `ChartTooltip` | Chart | Contenido del tooltip con orden fijo de series |
| `DirectLabels` | Chart | Etiqueta directa (valor + nombre) al final de cada serie, con anti-superposición. Va en `<Customized>` y requiere margen derecho ~108 px |
| `useChartStyle` / `chartStyle` | Chart | Props de ejes, grid, cursores, líneas, franjas y líneas de referencia |
| `yAxisNice` / `yDomain` | Chart | Eje Y ajustado a los datos con ticks redondos |
| `FreshnessLine` | Freshness | "● IPC al oct-26 · calculado … · próxima publicación: …" |
| `ThemeSwitch` | ThemeSwitch | Claro / Oscuro |
| `Sidebar` | layout/Sidebar | Navegación por grupos; ítem activo con barra celeste |
| `SiteFooter` | layout/SiteFooter | Pie por ruta (las pestañas migradas declaran su fuente) |

Datos de soporte:

- `src/lib/indec/calendario.ts` + `data/indec/calendario-ipc.json`: fechas de publicación del IPC, cargadas a mano desde el calendario oficial de INDEC (verificado el 13/11/2026). Si la última fecha cargada ya pasó, se muestra "sin dato". Si INDEC ya publicó un período que no tenemos, se muestra "desactualizado".
- `src/lib/inflacion/formato.ts`: `fmt`, `fmtSigno` (signo menos tipográfico), `fmtMes` ("oct-26"), `mesLargo`.

## Reglas de gráficos

- Líneas de 2 px. Grid solo horizontal, 1 px, color rule.
- Etiqueta directa al final de cada serie (`DirectLabels`). Leyenda arriba si hay 2+ series.
- Tooltip con crosshair en líneas (`cursorLine`) y por barra en barras (`cursorBar`).
- Eje Y ajustado a los datos (`yAxisNice`), salvo en barras: ahí el 0 es obligatorio. Sin splines (`type="linear"`). Sin doble eje.
- Pie: fuente y "Último dato".
- "Ver tabla" en los gráficos principales.
- Escala divergente para "por debajo/por encima del nivel general"; el resto, neutros o paleta categórica.
- Franjas de referencia en gris tenue con rótulo (`S.band` + `S.bandLabel`).
- Valores desestacionalizados: "(s.e.)" en el rótulo.

## Página

Sin tarjetas ni emojis. Cada bloque se separa con un filete de 1 px color head arriba. Orden:

1. Línea de frescura.
2. Eyebrow.
3. Título.
4. Bajada.
5. Controles.
6. Lectura (si aplica).
7. KPIs.
8. Gráficos con subtítulo que enuncia la conclusión.
9. Metodología.

## Tema

Claro por defecto. Oscuro opcional, guardado en `localStorage` (`bcra-theme`) con try/catch. `<html>` lleva `data-theme` (sistema v5) y la clase `dark` (pestañas aún no migradas, que usan `dark:` de Tailwind). Un script inline en `<head>` aplica el tema antes del primer pintado.

## Cómo migrar otra pestaña

1. Reemplazar el encabezado por `FreshnessLine` + `Eyebrow` + `PageTitle` + `Lede`.
2. Pasar los selectores a una `ControlBar` con `Segmented`.
3. Reemplazar las tarjetas de KPI por `KpiStrip`/`Kpi` (delta neutro, sparkline, contexto).
4. Envolver cada gráfico en `ChartFrame` y usar `useChartStyle()` para ejes, grid, tooltip y líneas. Agregar `DirectLabels` en `<Customized>`.
5. Mover fórmulas a `howTo`.
6. Registrar el pie de la ruta en `SiteFooter`.
