/**
 * Sistema de diseño v5 — tokens.
 *
 * Fuente única de verdad: las variables CSS (`:root[data-theme=…]`) se generan desde acá en
 * `ThemeStyle`, y los gráficos (Recharts dibuja SVG con atributos, no con clases) leen los mismos
 * valores con `useTokens()`.
 *
 * La paleta categórica (s1–s4) y la divergente están validadas para daltonismo y contraste en ambos
 * modos. No agregar colores sin validarlos: para más tonos se interpola entre estos (ver `diverging`).
 */

export type ThemeName = "light" | "dark";

export interface Tokens {
  bg: string;
  surface: string;
  sidebar: string;
  rule: string;
  ruleStrong: string;
  text: string;
  text2: string;
  muted: string;
  /** Títulos y filetes de bloque. */
  head: string;
  /** Acento: filete del eyebrow, ítem activo del menú, punto de frescura. */
  celeste: string;
  /** Fondo tenue para hover/activo (deriva de la superficie, no transmite significado). */
  soft: string;
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  neutralBar: string;
  divLo: string;
  divMid: string;
  divHi: string;
  /** Franjas de referencia (zona sin señal, banda nula): gris tenue. */
  band: string;
  bandOpacity: number;
}

export const TOKENS: Record<ThemeName, Tokens> = {
  light: {
    bg: "#ffffff",
    surface: "#ffffff",
    sidebar: "#f5f7f9",
    rule: "#e2e6eb",
    ruleStrong: "#b9c2cc",
    text: "#14191f",
    text2: "#4a5360",
    muted: "#87909c",
    head: "#0f2c4a",
    celeste: "#6b9fcf",
    soft: "#eef2f6",
    s1: "#2f6ea8",
    s2: "#a8801a",
    s3: "#1d8c72",
    s4: "#9c4a3a",
    neutralBar: "#aab6c3",
    divLo: "#2f6ea8",
    divMid: "#d5dbe2",
    divHi: "#9c3a35",
    band: "#87909c",
    bandOpacity: 0.12,
  },
  dark: {
    bg: "#0f1b2a",
    surface: "#0f1b2a",
    sidebar: "#0a1420",
    rule: "#213247",
    ruleStrong: "#3a4f68",
    text: "#e9eef4",
    text2: "#b2bfcd",
    muted: "#7a8a9c",
    head: "#f1f4f8",
    celeste: "#8fb7de",
    soft: "#16263a",
    s1: "#5b93cc",
    s2: "#b08a24",
    s3: "#1f957a",
    s4: "#c95f48",
    neutralBar: "#3f5872",
    divLo: "#5b93cc",
    divMid: "#34465c",
    divHi: "#cc5f58",
    band: "#7a8a9c",
    bandOpacity: 0.16,
  },
};

/** Nombre de la variable CSS de cada token (camelCase → kebab-case). */
export const cssVarName = (k: keyof Tokens) => `--${k.replace(/[A-Z0-9]/g, (m) => `-${m.toLowerCase()}`)}`;

/** Hoja de estilo con las variables de ambos temas. Claro es el default (también sin atributo). */
export function themeCss(): string {
  const block = (t: Tokens) =>
    (Object.keys(t) as (keyof Tokens)[]).map((k) => `${cssVarName(k)}:${t[k]};`).join("");
  return (
    `:root,:root[data-theme="light"]{color-scheme:light;${block(TOKENS.light)}}` +
    `:root[data-theme="dark"]{color-scheme:dark;${block(TOKENS.dark)}}`
  );
}

// ---------------------------------------------------------------------------
// Escala divergente: por debajo / por encima del nivel general
// ---------------------------------------------------------------------------

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

/**
 * Color de la escala divergente para x ∈ [−1, 1]: −1 = bajo pleno, 0 = medio, +1 = alto pleno.
 * Interpola en RGB entre los tres tonos validados (no agrega tonos nuevos de otra familia).
 */
export function diverging(t: Tokens, x: number): string {
  const v = Math.max(-1, Math.min(1, x));
  return v < 0 ? mix(t.divMid, t.divLo, -v) : mix(t.divMid, t.divHi, v);
}

/**
 * n tonos por debajo y m por encima del punto medio, del más extremo bajo al más extremo alto.
 * El tono más cercano al medio queda a 30 % del recorrido para que se distinga del fondo.
 */
export function divergingSteps(t: Tokens, nBajo: number, nAlto: number): string[] {
  const paso = (i: number, n: number) => 0.3 + (0.7 * i) / Math.max(1, n - 1);
  const bajo = Array.from({ length: nBajo }, (_, i) => diverging(t, -paso(nBajo - 1 - i, nBajo)));
  const alto = Array.from({ length: nAlto }, (_, i) => diverging(t, paso(i, nAlto)));
  return [...bajo, ...alto];
}
