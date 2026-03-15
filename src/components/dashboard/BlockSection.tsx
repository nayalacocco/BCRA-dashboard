interface BlockSectionProps {
  title: string;
  icon: string;
  color: "emerald" | "violet" | "blue" | "orange" | "green" | "red";
  children: React.ReactNode;
}

// Tailwind static strings (required for tree-shaking to keep these classes)
const styles = {
  emerald: {
    border:  "border-emerald-500",
    badge:   "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400",
  },
  violet: {
    border:  "border-violet-500",
    badge:   "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400",
  },
  blue: {
    border:  "border-blue-500",
    badge:   "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400",
  },
  orange: {
    border:  "border-orange-500",
    badge:   "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400",
  },
  green: {
    border:  "border-green-500",
    badge:   "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400",
  },
  red: {
    border:  "border-red-500",
    badge:   "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400",
  },
};

export function BlockSection({ title, icon, color, children }: BlockSectionProps) {
  const s = styles[color];
  return (
    <section>
      {/* Block header */}
      <div className={`flex items-center gap-3 mb-5 pb-3 border-b-2 ${s.border}`}>
        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${s.badge}`}>
          <span>{icon}</span>
          <span>{title}</span>
        </span>
      </div>

      {/* Block content */}
      <div>{children}</div>
    </section>
  );
}
