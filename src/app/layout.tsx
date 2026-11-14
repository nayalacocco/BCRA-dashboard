import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { ThemeProvider, THEME_BOOT_SCRIPT } from "@/components/theme/ThemeProvider";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { themeCss } from "@/design/tokens";

export const metadata: Metadata = {
  title: {
    default: "Argentina Dashboard",
    template: "%s | Argentina Dashboard",
  },
  description:
    "Dashboard de indicadores económicos de Argentina. Tipo de cambio, reservas, tasas de interés, inflación, bonos y ONs en tiempo real.",
  keywords: ["BCRA", "Argentina", "dólar", "economía", "reservas", "tasa", "inflación", "bonos", "ONs"],
  openGraph: {
    title: "Argentina Dashboard",
    description: "Indicadores económicos de Argentina en tiempo real",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" data-theme="light" suppressHydrationWarning>
      <head>
        {/* Aplica el tema guardado antes del primer pintado (evita el parpadeo) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
        <ThemeProvider>
          <div className="lg:flex min-h-screen">
            <Sidebar />
            <div className="flex-1 min-w-0 flex flex-col">
              <main className="flex-1 w-full max-w-[1280px] px-5 sm:px-8 lg:px-12 pt-7 pb-10">{children}</main>
              <SiteFooter />
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
