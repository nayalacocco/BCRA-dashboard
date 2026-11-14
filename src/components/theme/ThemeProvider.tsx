"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { TOKENS, type ThemeName, type Tokens } from "@/design/tokens";

/**
 * Tema: claro por defecto; oscuro opcional, con la preferencia en localStorage.
 * Se marca en <html> con `data-theme` (variables del sistema v5) y con la clase `dark`
 * (las pestañas que todavía usan las clases `dark:` de Tailwind).
 */
export const THEME_KEY = "bcra-theme";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: "light", setTheme: () => {}, toggle: () => {} });

function aplicar(t: ThemeName) {
  const el = document.documentElement;
  el.dataset.theme = t;
  el.classList.toggle("dark", t === "dark");
}

function leer(): ThemeName {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function guardar(t: ThemeName) {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* modo privado o storage bloqueado: el tema dura la sesión */
  }
}

/** Script inline para <head>: aplica el tema guardado antes del primer pintado (evita el parpadeo). */
export const THEME_BOOT_SCRIPT = `(function(){var t='light';try{if(localStorage.getItem('${THEME_KEY}')==='dark')t='dark'}catch(e){}var d=document.documentElement;d.dataset.theme=t;if(t==='dark')d.classList.add('dark');})();`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("light");

  useEffect(() => {
    const t = leer();
    setThemeState(t);
    aplicar(t);
  }, []);

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
    aplicar(t);
    guardar(t);
  }, []);

  const toggle = useCallback(() => setTheme(theme === "light" ? "dark" : "light"), [theme, setTheme]);

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** Tokens resueltos del tema activo, para los gráficos (Recharts necesita colores literales). */
export function useTokens(): Tokens {
  return TOKENS[useTheme().theme];
}
