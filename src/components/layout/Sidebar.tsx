"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const navLinks = [
  { href: "/dashboard",      label: "Dashboard" },
  { href: "/sector-externo", label: "Sector Externo" },
  { href: "/inflacion",      label: "Inflación" },
  { href: "/mercado",        label: "Mercado" },
  { href: "/historico",      label: "Histórico" },
  { href: "/series",         label: "Comparador" },
  { href: "/on-list",        label: "ONs — Lista completa" },
];

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel on navigation
  useEffect(() => { setOpen(false); }, [pathname]);

  // Close on click outside the panel
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <>
      {/* ── Top bar ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm flex items-center px-4 gap-3">
        {/* Arg toggle */}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          className="w-9 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 flex items-center justify-center transition-all flex-shrink-0"
        >
          <span className="text-white font-bold text-[11px] tracking-tight leading-none">
            Arg
          </span>
        </button>

        {/* Title */}
        <span className="font-bold text-slate-900 dark:text-slate-100 text-base hidden sm:block select-none">
          Argentina Dashboard
        </span>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden md:block text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 dark:text-slate-500 px-2 py-1 rounded-md font-mono">
            API v4.0
          </span>
          <ThemeToggle />
        </div>
      </header>

      {/* ── Backdrop ─────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
      />

      {/* ── Slide-out panel ──────────────────────────────────── */}
      <div
        ref={panelRef}
        className={`fixed left-0 top-14 z-50 h-[calc(100vh-3.5rem)] w-52 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-xl flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Nav links */}
        <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 text-center">
          Argentina Dashboard
        </div>
      </div>
    </>
  );
}
