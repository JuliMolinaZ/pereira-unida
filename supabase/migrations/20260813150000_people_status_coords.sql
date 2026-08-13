-- Ubicación exacta en "Estoy bien" (GPS o pin en el mapa).
alter table public.people_status
  add column if not exists lat float8;

alter table public.people_status
  add column if not exists lng float8;
