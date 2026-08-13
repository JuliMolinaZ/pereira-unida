import type { Metadata, Viewport } from "next";
import { Archivo, Fraunces } from "next/font/google";
import PwaRegister from "@/components/PwaRegister";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
  axes: ["wdth"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pereiraunida.vercel.app";
const SITE_DESCRIPTION =
  "Coordina y solicita ayuda ciudadana en tiempo real en Pereira y Dosquebradas tras una emergencia: alimentos, herramientas, medicinas, voluntariado, red familiar y puntos de acopio.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Pereira Unida — Ayuda ciudadana en emergencia",
  description: SITE_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pereira Unida",
  },
  openGraph: {
    title: "Pereira Unida",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "Pereira Unida",
    locale: "es_CO",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pereira Unida",
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1c1410",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${archivo.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
