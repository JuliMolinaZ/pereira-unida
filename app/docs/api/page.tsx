"use client";

import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 py-4">
        <h1 className="text-lg font-semibold text-ink">Pereira Unida — API pública</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Solo lectura: ayudas (solicitudes) y ayudantes (ofertas de ayuda). Pedí la API key al
          equipo de Pereira Unida y tocá <strong>Authorize</strong> abajo para probar los
          endpoints desde acá.
        </p>
      </div>
      <SwaggerUI url="/api/public/v1/openapi.json" />
    </div>
  );
}
