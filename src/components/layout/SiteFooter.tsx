"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { fmtFecha, proximaPublicacion } from "@/lib/indec/calendario";

/**
 * Pie de página. Las pestañas migradas al sistema v5 declaran su fuente acá; el resto mantiene el pie
 * anterior hasta que se migren.
 */
function PieInflacion() {
  const [prox, setProx] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const p = proximaPublicacion();
    setProx(p ? fmtFecha(p.fecha) : null);
  }, []);
  return (
    <span>
      Fuente: INDEC (IPC base dic-2016) · próxima publicación: {prox === undefined ? "…" : prox ?? "sin dato"}
    </span>
  );
}

const PIES: Record<string, () => React.ReactNode> = {
  "/inflacion/difusion": () => <PieInflacion />,
  "/mercado/fx": () => (
    <span>
      Fuentes: BCRA (API v4, planilla NEDD-FMI), argentinadatos.com · actualización automática dos veces por día hábil
    </span>
  ),
};

export function SiteFooter() {
  const pathname = usePathname();
  const propio = PIES[pathname];
  return (
    <footer className="mt-14 border-t border-ds-rule">
      <div className="px-5 sm:px-8 lg:px-12 py-4 flex flex-col sm:flex-row justify-between gap-2 text-[12px] text-ds-muted">
        {propio ? (
          <>
            {propio()}
            <span>Uso interno</span>
          </>
        ) : (
          <>
            <span>
              Datos provistos por la{" "}
              <a href="https://www.bcra.gob.ar/en/central-bank-api-catalog/" target="_blank" rel="noopener noreferrer" className="underline">
                API oficial del BCRA
              </a>{" "}
              — Principales Variables v4.0
            </span>
            <span>Actualización automática cada 30 minutos</span>
          </>
        )}
      </div>
    </footer>
  );
}
