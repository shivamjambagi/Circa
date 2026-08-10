import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Circa | Map your people", template: "%s | Circa" },
  description: "A private, local-first relationship sketchbook for mapping people, connections, groups and organisation charts without ranking them.",
  applicationName: "Circa",
  keywords: ["relationship map", "personal network", "organisation chart", "local-first"],
  openGraph: { title: "Circa | Map your people", description: "Sketch how your world connects, with context instead of scores.", type: "website", siteName: "Circa" },
  robots: { index: true, follow: true },
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${manrope.variable} ${fraunces.variable}`}>{children}</body></html>;
}
