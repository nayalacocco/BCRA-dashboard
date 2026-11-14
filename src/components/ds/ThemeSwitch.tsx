"use client";

import { useTheme } from "@/components/theme/ThemeProvider";
import { Segmented } from "./Controls";

/** Selector de tema Claro / Oscuro (la preferencia queda en localStorage). */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-ds-muted">Tema</span>
      <Segmented
        ariaLabel="Tema"
        value={theme}
        onChange={setTheme}
        options={[
          { key: "light", label: "Claro" },
          { key: "dark", label: "Oscuro" },
        ]}
      />
    </div>
  );
}
