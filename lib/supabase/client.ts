"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfigError } from "./config";

let browserClient: SupabaseClient | undefined;

/**
 * Indica si NEXT_PUBLIC_SUPABASE_URL/ANON_KEY tienen forma válida (no un
 * placeholder). No cambia el comportamiento de getSupabaseBrowserClient —
 * es un helper adicional para que quien la llame decida si conviene
 * suscribirse a Realtime (ej. no intentarlo si dataError viene seteado).
 */
export function isSupabaseBrowserConfigured(): boolean {
  return getSupabaseConfigError() === null;
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Faltan las variables de entorno NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  browserClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  return browserClient;
}
