/**
 * Validación de configuración de Supabase, compartida entre el cliente de
 * servidor (lib/supabase/server.ts) y el de navegador (lib/supabase/client.ts).
 * Sin "server-only": solo lee NEXT_PUBLIC_* (inlineadas en build, seguras en
 * ambos lados) y debe poder importarse desde un componente cliente.
 *
 * Por qué existe: `.env.local` con placeholders
 * (NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co) pasa un
 * chequeo de "¿existen las variables?" pero createClient().from(...).select()
 * intenta un fetch real contra ese host, que falla en DNS con
 * "TypeError: fetch failed". Esta función detecta el placeholder ANTES de
 * intentar ese fetch.
 */

export const SUPABASE_CONFIG_ERROR_MESSAGE =
  "Supabase no está configurado. En .env.local, NEXT_PUBLIC_SUPABASE_URL es un placeholder (https://placeholder.supabase.co). Crea un proyecto en supabase.com, pega Project URL y anon key, ejecuta schema.sql en el SQL Editor, y reinicia npm run dev.";

export function getSupabaseConfigError(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return SUPABASE_CONFIG_ERROR_MESSAGE;

  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes("placeholder") || lowerUrl.includes("tu-proyecto")) {
    return SUPABASE_CONFIG_ERROR_MESSAGE;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return SUPABASE_CONFIG_ERROR_MESSAGE;
  }

  if (parsed.protocol !== "https:") return SUPABASE_CONFIG_ERROR_MESSAGE;
  if (!parsed.hostname.toLowerCase().includes("supabase")) {
    return SUPABASE_CONFIG_ERROR_MESSAGE;
  }

  if (key === "tu-anon-key" || key === "placeholder-anon-key" || key.length < 20) {
    return SUPABASE_CONFIG_ERROR_MESSAGE;
  }

  return null;
}
