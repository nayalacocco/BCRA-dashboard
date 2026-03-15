interface LoadingStateProps {
  message?: string;
  variant?: "spinner" | "skeleton";
  rows?: number;
}

export function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "sm" ? "w-4 h-4" : size === "lg" ? "w-10 h-10" : "w-6 h-6";
  return (
    <svg
      className={`${sizeClass} animate-spin text-bcra-600`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export function LoadingState({ message = "Cargando datos del BCRA..." }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <LoadingSpinner size="lg" />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="card card-dark p-6 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="h-3 bg-slate-200 rounded w-24 mb-2" />
          <div className="h-8 bg-slate-200 rounded w-32" />
        </div>
        <div className="w-10 h-10 bg-slate-200 rounded-lg" />
      </div>
      <div className="h-12 bg-slate-100 rounded" />
    </div>
  );
}

export function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div
      className="animate-pulse bg-slate-100 rounded-xl flex items-end gap-1 p-4"
      style={{ height }}
    >
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="bg-slate-200 rounded-t flex-1"
          style={{ height: `${Math.random() * 60 + 20}%` }}
        />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 py-3 border-b border-slate-100">
          <div className="h-4 bg-slate-200 rounded w-24" />
          <div className="h-4 bg-slate-200 rounded w-32" />
          <div className="h-4 bg-slate-200 rounded w-20" />
        </div>
      ))}
    </div>
  );
}
