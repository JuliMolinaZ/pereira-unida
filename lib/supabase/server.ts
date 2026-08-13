import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfigError } from "./config";

/**
 * Crea el cliente de Supabase (anon) para Server Actions/Components, o
 * `null` si la configuración es inválida (placeholder, vars faltantes,
 * URL/key con forma incorrecta). Úsalo en lecturas y escrituras para evitar
 * el "TypeError: fetch failed" que dispara un DNS roto contra un host
 * placeholder: si esto retorna null, no se intentó ningún fetch.
 */
export function tryCreateServerSupabaseClient(): SupabaseClient | null {
  if (getSupabaseConfigError()) return null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Igual que `tryCreateServerSupabaseClient`, pero lanza si la configuración
 * es inválida. Se mantiene por compatibilidad con código que espera un
 * cliente no-nulo; dentro de app/actions.ts se prefiere la variante que
 * retorna `null` para no propagar un throw no controlado hacia el render.
 */
export function createServerSupabaseClient(): SupabaseClient {
  const client = tryCreateServerSupabaseClient();
  if (!client) {
    throw new Error(getSupabaseConfigError() ?? "Supabase no está configurado.");
  }
  return client;
}
