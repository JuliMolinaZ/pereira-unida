import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    // Fotos de celular superan el 1 MB por defecto de Server Actions.
    serverActions: {
      bodySizeLimit: "16mb",
    },
    proxyClientMaxBodySize: "16mb",
  },
  async headers() {
    return [
      {
        // El service worker debe revalidarse siempre: si el navegador lo
        // cachea, las actualizaciones de la app tardarían en propagarse.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
      {
        source: "/maplibre/:path*.mjs",
        headers: [
          { key: "Content-Type", value: "text/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
