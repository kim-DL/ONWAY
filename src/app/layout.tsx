import type { Metadata, Viewport } from "next";

import { PwaProvider } from "@/features/pwa/pwa-provider";
import { APP_METADATA } from "@/lib/app-metadata";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: APP_METADATA.name,
    template: `%s · ${APP_METADATA.name}`,
  },
  description: APP_METADATA.description,
  applicationName: APP_METADATA.name,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_METADATA.shortName,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: [{ url: "/icons/onnuriway-apple-touch-icon-v2.png", sizes: "180x180", type: "image/png" }],
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: APP_METADATA.themeColor,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body><PwaProvider>{children}</PwaProvider></body>
    </html>
  );
}
