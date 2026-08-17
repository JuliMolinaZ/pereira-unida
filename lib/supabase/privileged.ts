import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "./server";
import { getSupabaseConfigError } from "./config";

/**
 * Cliente de Supabase privilegiado: usa la service role si está configurada
 * (bypassa RLS de forma controlada, solo desde el server) y si no cae al
 * cliente anon normal. Necesario para toda escritura de la app y para leer
 * `people_status` (red familiar) — desde la migración
 * `20260817010000_lock_down_rls.sql`, esas tablas ya no tienen policy
 * pública de RLS: cualquiera con la anon key podía leer/escribir directo
 * por REST o Realtime, saltándose el rate limiting y la validación del
 * server. Ver "Notas de seguridad" en el README.
 *
 * Usado tanto por los Server Actions (`app/actions.ts`) como por la API
 * pública (`app/api/public/v1/*`), para que ambos caminos de escritura
 * respeten exactamente el mismo modelo de seguridad.
 */
export function getPrivilegedSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceRoleKey) {
    return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }
  return createServerSupabaseClient();
}

export type SupabaseOrError =
  | { client: SupabaseClient; error: null }
  | { client: null; error: string };

/** Igual que `getPrivilegedSupabaseClient`, pero sin lanzar si la config de
 * Supabase es un placeholder — retorna el mensaje de error en su lugar. */
export function getPrivilegedSupabaseOrError(): SupabaseOrError {
  const cfg = getSupabaseConfigError();
  if (cfg) return { client: null, error: cfg };
  return { client: getPrivilegedSupabaseClient(), error: null };
}
