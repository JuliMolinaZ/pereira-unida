-- ============================================================================
-- MIGRACIÓN — Notificaciones push (2026-08-17)
--
-- Suscripciones Web Push (VAPID), una fila por dispositivo/navegador
-- suscrito. Sin ninguna policy pública de RLS a propósito, mismo modelo que
-- people_status desde 20260817010000_lock_down_rls.sql — el endpoint de
-- push es semi-sensible (alguien con la key VAPID privada podría abusarlo
-- para spamear notificaciones a ese endpoint puntual) y no hay ninguna razón
-- para que sea legible/escribible directo por REST. Toda la escritura pasa
-- por app/actions.ts con getPrivilegedSupabaseClient().
-- ============================================================================

create table if not exists public.push_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  endpoint       text not null unique,
  p256dh         text not null,
  auth           text not null,
  municipality   text,
  department     text,
  topics         text[] not null default '{}',
  last_notified_at timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists push_subscriptions_municipality_idx on public.push_subscriptions (municipality);

alter table public.push_subscriptions enable row level security;
