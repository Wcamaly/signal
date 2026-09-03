import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import RunButton from "@/components/RunButton";
import { hasKey, MODEL } from "@/lib/claude";

export const metadata: Metadata = {
  title: "Signal — radar de IA y publicaciones",
  description: "Analiza tendencias de IA, arma el resumen semanal y redacta las publicaciones.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <aside className="w-[212px] shrink-0 border-r border-line bg-[#0d0e11] flex flex-col">
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center gap-2">
                <div className="w-[22px] h-[22px] rounded-md bg-accent flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="1.6" fill="#14100a" />
                    <circle cx="6" cy="6" r="4" stroke="#14100a" strokeWidth="1.1" opacity=".55" />
                  </svg>
                </div>
                <span className="font-semibold text-[15px] tracking-tight">Signal</span>
              </div>
              <p className="text-[11px] text-faint mt-2 leading-snug">
                Radar de IA → resumen semanal → publicaciones
              </p>
            </div>
            <Nav />
            <div className="mt-auto px-5 py-4 border-t border-line">
              <div className="flex items-center gap-1.5 mb-3">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: hasKey() ? "var(--good)" : "var(--warn)" }}
                />
                <span className="text-[10.5px] text-faint font-mono">
                  {hasKey() ? MODEL : "modo demo · sin API key"}
                </span>
              </div>
              <RunButton />
            </div>
          </aside>
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
