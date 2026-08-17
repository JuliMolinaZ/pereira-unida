import { CATEGORY_LABELS, HELP_SKILL_LABELS } from "@/lib/types";
import { SITE_URL } from "@/lib/utils";
import { SUPPORT_INSTAGRAM_HANDLE, SUPPORT_WHATSAPP_URL } from "@/lib/support";

export const dynamic = "force-static";

const categories = Object.keys(CATEGORY_LABELS);
const skills = Object.keys(HELP_SKILL_LABELS);

const rateLimitHeaderSchemas = {
  "X-RateLimit-Limit": {
    description: "Máximo de solicitudes permitidas en la ventana actual (1 minuto).",
    schema: { type: "integer" },
  },
  "X-RateLimit-Remaining": {
    description: "Solicitudes restantes en la ventana actual.",
    schema: { type: "integer" },
  },
  "X-RateLimit-Reset": {
    description: "Epoch (segundos) en que se reinicia la ventana de rate limit.",
    schema: { type: "integer" },
  },
} as const;

const spec = {
  openapi: "3.0.3",
  info: {
    title: "Pereira Unida — API pública",
    version: "1.0.0",
    description:
      "API oficial de Pereira Unida para consumir y enviar ayudas (solicitudes de ayuda) y ayudantes " +
      `(ofertas de ayuda). Requiere una API key compartida — pedila por WhatsApp o Instagram ${SUPPORT_INSTAGRAM_HANDLE}. ` +
      "Nunca expone teléfonos de contacto (contact_phone/phone) ni ningún otro " +
      "dato personal de emergencia: eso solo se muestra, de a una persona por vez, dentro de la propia app. " +
      "Toda la base de datos de Pereira Unida vive detrás de esta API — no hay acceso directo alternativo.",
    contact: { name: `Pereira Unida — soporte por WhatsApp/Instagram ${SUPPORT_INSTAGRAM_HANDLE}`, url: SUPPORT_WHATSAPP_URL },
    license: { name: "Uso restringido a integraciones autorizadas" },
  },
  servers: [{ url: SITE_URL, description: "Producción" }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "Ayudas", description: "Solicitudes de ayuda (necesidades reportadas)." },
    { name: "Ayudantes", description: "Ofertas de ayuda (personas/oficios disponibles)." },
  ],
  paths: {
    "/api/public/v1/ayudas": {
      get: {
        tags: ["Ayudas"],
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
            headers: rateLimitHeaderSchemas,
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
      post: {
        tags: ["Ayudas"],
        summary: "Registrar una solicitud de ayuda",
        description:
          "Publica una necesidad nueva en Pereira Unida a nombre de tu app. Queda visible de inmediato " +
          "con el mismo trato que un reporte hecho desde la web (sin cola de moderación) y sujeta al " +
          "mismo rate limit de escritura (20/min por API key).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateAyuda" },
              example: {
                title: "Familia sin alimentos en La Dulcera",
                description: "5 personas, incluye 2 niños. Acceso solo a pie.",
                category: "alimentos",
                urgent_level: "critico",
                municipality: "Pereira",
                department: "Risaralda",
                location_name: "Barrio La Dulcera, cerca a la cancha",
                lat: 4.8087,
                lng: -75.6906,
                contact_phone: "3001234567",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Creada",
            headers: rateLimitHeaderSchemas,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { $ref: "#/components/schemas/Ayuda" } },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "429": { $ref: "#/components/responses/TooManyRequests" },
        },
      },
    },
    "/api/public/v1/ayudantes": {
      get: {
        tags: ["Ayudantes"],
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
            headers: rateLimitHeaderSchemas,
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
      post: {
        tags: ["Ayudantes"],
        summary: "Registrar una oferta de ayuda",
        description:
          "Publica a alguien disponible para ayudar a nombre de tu app. Mismo modelo de confianza y " +
          "rate limit que POST /ayudas.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateAyudante" },
              example: {
                full_name: "Ana María Ríos",
                skill: "medico",
                description: "Médica general, disponible fines de semana.",
                phone: "3011234567",
                municipality: "Dosquebradas",
                department: "Risaralda",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Creada",
            headers: rateLimitHeaderSchemas,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { $ref: "#/components/schemas/Ayudante" } },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
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
      BadRequest: {
        description: "Parámetros o body inválidos",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      Unauthorized: {
        description: "API key inválida o ausente",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      TooManyRequests: {
        description: "Rate limit excedido",
        headers: rateLimitHeaderSchemas,
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string", description: "Código estable, ej. invalid_category." },
              message: { type: "string" },
            },
          },
        },
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
      CreateAyuda: {
        type: "object",
        required: ["title", "category", "municipality", "lat", "lng", "contact_phone"],
        properties: {
          title: { type: "string", maxLength: 200 },
          description: { type: "string", maxLength: 2000 },
          category: { type: "string", enum: categories },
          urgent_level: {
            type: "string",
            enum: ["critico", "moderado", "atendido"],
            default: "moderado",
          },
          municipality: { type: "string", description: "Nombre exacto de un municipio colombiano." },
          department: { type: "string" },
          location_name: { type: "string" },
          lat: { type: "number" },
          lng: { type: "number" },
          contact_phone: {
            type: "string",
            description: "Nunca se devuelve en ningún GET — solo se usa dentro de la propia app.",
          },
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
      CreateAyudante: {
        type: "object",
        required: ["full_name", "skill", "phone", "municipality"],
        properties: {
          full_name: { type: "string", maxLength: 80 },
          skill: { type: "string", enum: skills },
          description: { type: "string", maxLength: 800 },
          phone: {
            type: "string",
            description: "Nunca se devuelve en ningún GET — solo se usa dentro de la propia app.",
          },
          municipality: { type: "string" },
          department: { type: "string" },
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
