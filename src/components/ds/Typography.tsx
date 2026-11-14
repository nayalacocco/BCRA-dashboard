/**
 * Sistema de diseño v5 — tipografía y estructura de página.
 * Serif (Source Serif 4) para títulos, bajadas y lecturas; Inter para texto y UI.
 */

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-8 mb-2">
      <span className="block w-9 h-[2px] bg-ds-celeste mb-3" aria-hidden />
      <p className="text-[11.5px] uppercase tracking-[0.16em] font-semibold text-ds-text-2">{children}</p>
    </div>
  );
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="font-serif font-semibold text-[34px] leading-[1.15] tracking-[-0.015em] text-ds-head mb-2.5">{children}</h1>;
}

/** Bajada: la conclusión de la página en una o dos oraciones. Admite <b> para lo esencial. */
export function Lede({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-serif text-[18.5px] leading-[1.55] text-ds-text max-w-[860px] [&_b]:font-semibold">{children}</p>
  );
}

/**
 * Sección: título serif y subtítulo que enuncia la conclusión. Sin tarjeta: el contenido se separa
 * con el filete de los bloques (ver `Block`).
 */
export function Section({
  title,
  sub,
  right,
  children,
  id,
}: {
  title: string;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mt-11">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <h2 className="font-serif font-semibold text-[21px] tracking-[-0.01em] text-ds-head">{title}</h2>
        {right}
      </div>
      {sub && <p className="text-ds-text-2 text-[14px] mt-1 mb-3.5 max-w-[820px]">{sub}</p>}
      {children}
    </section>
  );
}

/** Bloque: filete de 1 px color head arriba, sin fondo ni bordes redondeados. */
export function Block({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`border-t border-ds-head pt-3.5 pb-1.5 ${className}`}>{children}</div>;
}

/** Nota al margen con filete celeste a la izquierda. */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-ds-text-2 text-[12.5px] border-l-2 border-ds-celeste pl-3 py-0.5 mt-4 max-w-[900px]">{children}</div>
  );
}

/** Desplegable secundario ("ⓘ Cómo se calcula"): fórmulas y detalle metodológico fuera del texto principal. */
export function HowTo({ children, label = "Cómo se calcula" }: { children: React.ReactNode; label?: string }) {
  return (
    <details className="group mt-1.5 text-[12px] text-ds-muted">
      <summary className="cursor-pointer select-none list-none hover:text-ds-text-2 [&::-webkit-details-marker]:hidden">
        <span aria-hidden>ⓘ</span> {label}
      </summary>
      <div className="mt-1.5 pl-4 space-y-1 leading-relaxed">{children}</div>
    </details>
  );
}

/** Fórmula en estilo secundario. */
export function Formula({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11.5px] text-ds-muted">{children}</p>;
}
