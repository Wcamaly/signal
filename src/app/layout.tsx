import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import I18nProvider from "@/components/I18nProvider";
import Nav from "@/components/Nav";
import Sidebar from "@/components/Sidebar";
import { getDictionary, getUiLocale } from "@/lib/i18n";
import { llmStatus } from "@/lib/llm";

export function generateMetadata(): Metadata {
  const t = getDictionary();
  return { title: t.app.metaTitle, description: t.app.metaDescription };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a0b0d" };

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <div className="w-[22px] h-[22px] rounded-md bg-accent flex items-center justify-center">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="1.6" fill="#14100a" />
          <circle cx="6" cy="6" r="4" stroke="#14100a" strokeWidth="1.1" opacity=".55" />
        </svg>
      </div>
      <span className="font-semibold text-[15px] tracking-tight">Signal</span>
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const status = llmStatus();
  const locale = getUiLocale();
  const t = getDictionary();

  return (
    <html lang={locale}>
      <body className="min-h-screen">
        <I18nProvider locale={locale}>
        <div className="md:flex min-h-screen">
          <Sidebar brand={<Brand />}>
            <div className="px-5 pt-5 pb-4">
              <Brand />
              <p className="text-[11px] text-faint mt-2 leading-snug">{t.app.tagline}</p>
            </div>
            <Nav />
            <div className="mt-auto px-5 py-4 border-t border-line">
              <Link href="/manage/model" className="flex items-center gap-1.5 mb-3 group">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: status.ready ? "var(--good)" : "var(--warn)" }}
                />
                <span className="text-[10.5px] text-faint font-mono truncate group-hover:text-muted">
                  {status.ready ? `${status.provider}/${status.model}` : t.app.noModel}
                </span>
              </Link>
              <Link href="/runs/new" className="btn btn-primary w-full justify-center">
                {t.run.button}
              </Link>
            </div>
          </Sidebar>
          <main className="flex-1 min-w-0">{children}</main>
        </div>
        </I18nProvider>
      </body>
    </html>
  );
}
