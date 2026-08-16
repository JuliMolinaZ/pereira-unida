import { CATEGORY_LABELS, HELP_SKILL_LABELS } from "@/lib/types";
import { SITE_URL } from "@/lib/utils";

export const dynamic = "force-static";

const categories = Object.keys(CATEGORY_LABELS);
const skills = Object.keys(HELP_SKILL_LABELS);

const spec = {
  openapi: "3.0.3",
  info: {
    title: "Pereira Unida — API pública",
    version: "1.0.0",
    description:
      "API de solo lectura para consumir ayudas (solicitudes de ayuda) y ayudantes (ofertas de ayuda) de Pereira Unida. Requiere una API key compartida — pedila al equipo de Pereira Unida. Nunca incluye teléfonos de contacto (son datos personales de emergencia).",
  },
  servers: [{ url: SITE_URL }],
  security: [{ bearerAuth: [] }],
  paths: {
    "/api/public/v1/ayudas": {
      get: {
        summary: "Listar ayudas (solicitudes de ayuda)",
        parameters: [
          {
            name: "municipio",
            in: "query",
            schema: { type: "string" },
            description: "Filtra por municipio exacto (ej. Pereira).",
          },
          {
            name: "categoria",
            in: "query",
            schema: { type: "string", enum: categories },
          },
          {
            name: "estado",
            in: "query",
            schema: { type: "string", enum: ["activo", "cerrado", "todos"], default: "activo" },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 100, maximum: 200 },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Ayuda" } },
                    count: { type: "integer" },
                    generated_at: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "429": { $ref: "#/components/responses/TooManyRequests" },
        },
      },
    },
    "/api/public/v1/ayudantes": {
      get: {
        summary: "Listar ayudantes (ofertas de ayuda)",
        parameters: [
          {
            name: "municipio",
            in: "query",
            schema: { type: "string" },
          },
          {
            name: "habilidad",
            in: "query",
            schema: { type: "string", enum: skills },
          },
          {
            name: "estado",
            in: "query",
            schema: { type: "string", enum: ["activa", "todas"], default: "activa" },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 100, maximum: 200 },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Ayudante" } },
                    count: { type: "integer" },
                    generated_at: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "429": { $ref: "#/components/responses/TooManyRequests" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "API key compartida. También aceptado como header 'X-Api-Key'.",
      },
    },
    responses: {
      Unauthorized: {
        description: "API key inválida o ausente",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      TooManyRequests: {
        description: "Rate limit excedido",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
      },
      Ayuda: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          description: { type: "string" },
          category: { type: "string", enum: categories },
          urgent_level: { type: "string", enum: ["critico", "moderado", "atendido"] },
          status: {
            type: "string",
            enum: ["buscando", "en_camino", "resuelto", "informacion_falsa", "duplicado"],
          },
          municipality: { type: "string" },
          department: { type: "string", nullable: true },
          location_name: { type: "string" },
          lat: { type: "number", nullable: true },
          lng: { type: "number", nullable: true },
          photo_urls: { type: "array", items: { type: "string", format: "uri" } },
          comments_count: { type: "integer" },
          created_at: { type: "string", format: "date-time" },
          last_confirmed_at: { type: "string", format: "date-time", nullable: true },
        },
      },
      Ayudante: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          full_name: { type: "string" },
          skill: { type: "string", enum: skills },
          description: { type: "string" },
          municipality: { type: "string" },
          department: { type: "string", nullable: true },
          status: { type: "string", enum: ["activa", "ocultada"] },
          created_at: { type: "string", format: "date-time" },
        },
      },
    },
  },
};

export async function GET() {
  return Response.json(spec, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
