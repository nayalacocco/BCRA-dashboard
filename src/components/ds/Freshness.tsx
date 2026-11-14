/**
 * Sistema de diseño v5 — línea única de frescura arriba de la página:
 * "● IPC al oct-26 · calculado 13/11/2026 · próxima publicación: 15/12/2026".
 */
export function FreshnessLine({
  items,
  stale = false,
}: {
  /** Fragmentos ya formateados; se unen con " · ". */
  items: React.ReactNode[];
  /** Si el dato está atrasado respecto del calendario: punto vacío y aviso. */
  stale?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-[12.5px] text-ds-muted border-b border-ds-rule pb-3">
      <span
        aria-hidden
        className={`inline-block w-[7px] h-[7px] rounded-full ${stale ? "border border-ds-text-2" : "bg-ds-celeste"}`}
      />
      {items.map((it, i) => (
        <span key={i} className="tnum">
          {i > 0 && <span className="mr-2">·</span>}
          {it}
        </span>
      ))}
      {stale && <span className="font-semibold text-ds-text-2">· desactualizado</span>}
    </div>
  );
}
