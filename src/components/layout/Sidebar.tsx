"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeSwitch } from "@/components/ds/ThemeSwitch";

/**
 * Sidebar del sistema de diseño v5: fija a la izquierda en escritorio, panel deslizable en móvil.
 * Título "Argentina" con filete celeste–blanco–celeste, grupos en versalitas chicas e ítem activo
 * con barra celeste a la izquierda.
 */

interface NavItem {
  href: string;
  label: string;
  sub?: boolean;
}

const NAV: { grupo: string; items: NavItem[] }[] = [
  { grupo: "Resumen", items: [{ href: "/dashboard", label: "Dashboard" }] },
  {
    grupo: "Fundamentos",
    items: [
      { href: "/inflacion", label: "Inflación" },
      { href: "/inflacion/difusion", label: "Difusión y rotación", sub: true },
      { href: "/sector-externo", label: "Sector externo" },
    ],
  },
  {
    grupo: "Mercados",
    items: [
      { href: "/mercado", label: "Mercado" },
      { href: "/mercado/fx", label: "Tipo de cambio", sub: true },
      { href: "/on-list", label: "ONs" },
    ],
  },
  {
    grupo: "Herramientas",
    items: [
      { href: "/historico", label: "Histórico" },
      { href: "/series", label: "Comparador" },
    ],
  },
];

const TODOS = NAV.flatMap((g) => g.items.map((i) => i.href));

/** Activo = la ruta más específica que coincide (para que /inflacion no quede activo en /inflacion/difusion). */
function activo(pathname: string): string | undefined {
  return TODOS.filter((h) => pathname === h || pathname.startsWith(h + "/")).sort((a, b) => b.length - a.length)[0];
}

function Brand() {
  return (
    <div className="px-6 pb-5 border-b border-ds-rule mb-3">
      <p className="font-serif text-[18px] font-semibold text-ds-head tracking-[0.01em]">Argentina</p>
      <div className="flex w-[54px] h-[3px] my-2.5" aria-hidden>
        <i className="flex-1 bg-ds-celeste" />
        <i className="flex-1 bg-white border-y border-ds-rule" />
        <i className="flex-1 bg-ds-celeste" />
      </div>
      <p className="text-[11px] uppercase tracking-[0.12em] text-ds-muted">Monitor macro y de valuación</p>
    </div>
  );
}

function Nav({ pathname }: { pathname: string }) {
  const on = activo(pathname);
  return (
    <nav className="flex-1 overflow-y-auto">
      {NAV.map((g) => (
        <div key={g.grupo}>
          <p className="smallcaps text-ds-muted mx-6 mt-5 mb-1.5">{g.grupo}</p>
          {g.items.map((it) => {
            const isOn = it.href === on;
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={isOn ? "page" : undefined}
                className={`block py-[5px] pr-6 border-l-[3px] text-[13.5px] transition-colors ${it.sub ? "pl-[33px]" : "pl-[21px]"} ${
                  isOn
                    ? "border-ds-celeste text-ds-head font-semibold bg-ds-soft"
                    : "border-transparent text-ds-text-2 hover:text-ds-head"
                }`}
              >
                {it.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const panel = (
    <>
      <Brand />
      <Nav pathname={pathname} />
      <div className="px-6 pt-4 pb-2 border-t border-ds-rule mt-4">
        <ThemeSwitch />
      </div>
    </>
  );

  return (
    <>
      {/* Escritorio */}
      <aside className="hidden lg:flex flex-col sticky top-0 h-screen w-[232px] shrink-0 bg-ds-sidebar border-r border-ds-rule py-7">
        {panel}
      </aside>

      {/* Móvil: barra superior + panel */}
      <div className="lg:hidden sticky top-0 z-40 h-12 bg-ds-sidebar border-b border-ds-rule flex items-center gap-3 px-4">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          className="w-8 h-8 flex flex-col items-center justify-center gap-[3px] rounded-md hover:bg-ds-soft"
        >
          <i className="block w-4 h-[1.5px] bg-ds-head" />
          <i className="block w-4 h-[1.5px] bg-ds-head" />
          <i className="block w-4 h-[1.5px] bg-ds-head" />
        </button>
        <span className="font-serif font-semibold text-ds-head">Argentina</span>
      </div>
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={`lg:hidden fixed inset-0 z-40 bg-black/30 transition-opacity ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />
      <aside
        className={`lg:hidden fixed left-0 top-0 z-50 h-screen w-[260px] bg-ds-sidebar border-r border-ds-rule py-7 flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {panel}
      </aside>
    </>
  );
}
