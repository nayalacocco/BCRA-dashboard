interface PendingCardProps {
  label: string;
  description: string;
  source: string;
  unit?: string;
  riskBand?: boolean;
}

export function PendingCard({ label, description, source, unit, riskBand }: PendingCardProps) {
  return (
    <div className="card-pending p-4 flex flex-col gap-2 min-h-[100px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide leading-tight">
          {label}
        </p>
        <span className="shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
          ⚠ pendiente
        </span>
      </div>

      {/* Placeholder value */}
      <div className="font-mono text-xl font-bold text-slate-300 dark:text-slate-700">
        — {unit && <span className="text-sm font-normal">{unit}</span>}
      </div>

      {/* Risk band preview (for brecha) */}
      {riskBand && (
        <div className="flex gap-1 mt-1">
          <div className="h-1.5 flex-1 rounded-full bg-emerald-400" title="&lt;20% verde" />
          <div className="h-1.5 flex-1 rounded-full bg-amber-400" title="20–40% amarillo" />
          <div className="h-1.5 flex-1 rounded-full bg-red-500" title="&gt;40% rojo" />
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto pt-1 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-600">
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span className="truncate">{description}</span>
        <span className="ml-auto shrink-0 font-medium">→ {source}</span>
      </div>
    </div>
  );
}
