"use client";

import dynamic from "next/dynamic";
import { KeyRound, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import "swagger-ui-react/swagger-ui.css";
import BrandMark from "@/components/BrandMark";
import { SUPPORT_INSTAGRAM_HANDLE, SUPPORT_INSTAGRAM_URL, SUPPORT_WHATSAPP_URL } from "@/lib/support";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

const FEATURES = [
  {
    icon: KeyRound,
    title: "Autenticada",
    body: "Cada integración usa su propia API key (Bearer token). Sin key, la API responde 503 en vez de quedar abierta por accidente.",
  },
  {
    icon: RefreshCw,
    title: "Rate limit por key",
    body: "60 lecturas/min y 20 envíos/min por API key. Los headers X-RateLimit-* de cada respuesta te dicen cuánto te queda.",
  },
  {
    icon: Lock,
    title: "Nunca expone teléfonos",
    body: "contact_phone y phone jamás salen en un GET, aunque la propia app sí los muestre a un humano de a uno. Ver Notas de seguridad en el repo.",
  },
  {
    icon: ShieldCheck,
    title: "Único camino a los datos",
    body: "La base de datos de Pereira Unida no tiene acceso público directo: todo pasa por esta API, versionada y con contrato estable (v1).",
  },
];

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-ink/10 bg-paper">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <BrandMark />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/12 px-2.5 py-1 text-[11px] font-semibold text-forest">
              <span className="h-1.5 w-1.5 rounded-full bg-forest" aria-hidden="true" />
              API v1 · en producción
            </span>
          </div>
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-3xl">
            API pública
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Consultá y enviá ayudas (solicitudes de ayuda) y ayudantes (ofertas de ayuda) de Pereira
            Unida desde tu propia app. Pedí una API key por{" "}
            <a
              href={SUPPORT_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-carmine underline"
            >
              WhatsApp
            </a>{" "}
            o{" "}
            <a
              href={SUPPORT_INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-carmine underline"
            >
              Instagram ({SUPPORT_INSTAGRAM_HANDLE})
            </a>
            , tocá <strong>Authorize</strong> más abajo y probá los endpoints desde acá mismo.
          </p>

          <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="glass rounded-2xl p-3.5">
                <dt className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <Icon className="h-4 w-4 shrink-0 text-carmine" aria-hidden="true" />
                  {title}
                </dt>
                <dd className="mt-1 text-[12px] leading-snug text-ink-soft">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <div className="px-2 pb-10 sm:px-4">
        <div className="pereira-swagger mx-auto max-w-5xl overflow-hidden rounded-[20px] bg-white shadow-[0_8px_32px_rgba(15,10,8,0.18)]">
          <SwaggerUI url="/api/public/v1/openapi.json" docExpansion="list" />
        </div>
      </div>

      <style>{`
        /*
         * swagger-ui-react trae su propio CSS fijo en claro (fondo blanco,
         * texto oscuro) sin soporte de dark mode. En vez de reescribirle cada
         * superficie interna (modelos, tablas, code blocks...), lo mostramos
         * dentro de una tarjeta blanca con bordes/sombra propios — se lee
         * como un documento embebido a propósito, en vez de un choque de
         * colores random con el resto de la página en modo oscuro.
         */
        .pereira-swagger { color-scheme: light; }
        .pereira-swagger .swagger-ui .topbar { display: none; }
        .pereira-swagger .swagger-ui .info .title small.version-stamp,
        .pereira-swagger .swagger-ui .info { margin: 1.25rem 0; }
        .pereira-swagger .swagger-ui .btn.authorize,
        .pereira-swagger .swagger-ui .btn.execute { background-color: var(--carmine); border-color: var(--carmine); }
        .pereira-swagger .swagger-ui .opblock.opblock-post { background: rgba(166,27,27,0.04); border-color: var(--carmine); }
        .pereira-swagger .swagger-ui .opblock.opblock-post .opblock-summary-method { background: var(--carmine); }
      `}</style>
    </div>
  );
}
