import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { pollConfig } from "@/config/poll.config";

export const metadata: Metadata = {
  title: pollConfig.title,
  description: pollConfig.subtitle,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only-focusable absolute left-2 top-2 z-50 rounded bg-brand px-3 py-2 text-white"
        >
          Skip to content
        </a>
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-3 px-4 py-4">
            <div>
              <p className="text-xl font-bold leading-tight sm:text-2xl">{pollConfig.title}</p>
              <p className="mt-1 text-sm text-muted sm:text-base">{pollConfig.subtitle}</p>
            </div>
            <nav aria-label="Main" className="flex gap-4 text-sm font-medium">
              <Link className="text-brand underline-offset-4 hover:underline" href="/">
                Your availability
              </Link>
              <Link className="text-brand underline-offset-4 hover:underline" href="/results">
                Group results
              </Link>
            </nav>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-5xl px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
