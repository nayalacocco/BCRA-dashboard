"use client";

/**
 * Sistema de diseño v5 — controles.
 * Segmentado con el activo en color head. Los controles de una página van agrupados en una sola fila
 * (`ControlBar`) sobre los gráficos.
 */

export interface SegOption<T extends string> {
  key: T;
  label: string;
  title?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegOption<T>[];
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex max-w-full overflow-x-auto border border-ds-rule-strong rounded-md">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            role="radio"
            aria-checked={on}
            title={o.title}
            onClick={() => onChange(o.key)}
            className={`px-2.5 py-1 text-[12px] border-r border-ds-rule last:border-r-0 transition-colors whitespace-nowrap ${
              on ? "bg-ds-head text-ds-bg font-medium" : "text-ds-text-2 hover:bg-ds-soft"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Control con rótulo en minúscula normal. */
export function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-ds-muted">{label}</span>
      {children}
    </div>
  );
}

/** Fila única de controles, pegajosa arriba al hacer scroll. */
export function ControlBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 lg:top-0 z-20 -mx-1 px-1 py-2.5 mt-6 bg-ds-bg border-y border-ds-rule flex flex-wrap items-center gap-x-5 gap-y-2">
      {children}
    </div>
  );
}
