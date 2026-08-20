import type { Metadata } from "next";

import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/fraunces/wght.css";

import "./globals.css";
import "./contact-directory-display.css";
import "./directory-import.css";
import OfflineNotice from "./OfflineNotice";

export const metadata: Metadata = {
  title: { default: "Circa | Map your people", template: "%s | Circa" },
  description: "A private, local-first relationship sketchbook for mapping people, connections, groups and organisation charts without ranking them.",
  applicationName: "Circa",
  keywords: ["relationship map", "personal network", "organisation chart", "local-first"],
  openGraph: { title: "Circa | Map your people", description: "Sketch how your world connects, with context instead of scores.", type: "website", siteName: "Circa" },
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  icons: {
  icon: "/favicon-v2.svg",
  shortcut: "/favicon-v2.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><OfflineNotice />{children}</body></html>;
}
