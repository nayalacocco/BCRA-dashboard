import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";

export const metadata: Metadata = {
  title: {
    default: "BCRA Dashboard",
    template: "%s | BCRA Dashboard",
  },
  description:
    "Dashboard de indicadores económicos del Banco Central de la República Argentina. Tipo de cambio, reservas, tasas de interés e inflación en tiempo real.",
  keywords: ["BCRA", "Argentina", "dólar", "economía", "reservas", "tasa", "inflación"],
  openGraph: {
    title: "BCRA Dashboard",
    description: "Indicadores del Banco Central de la República Argentina",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="mt-16 border-t border-slate-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-slate-500">
            <span>
              Datos provistos por la{" "}
              <a
                href="https://www.bcra.gob.ar/en/central-bank-api-catalog/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-bcra-600 hover:underline"
              >
                API oficial del BCRA
              </a>{" "}
              — Principales Variables v4.0
            </span>
            <span>Actualización automática cada hora</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
