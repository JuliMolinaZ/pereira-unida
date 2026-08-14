-- Notas de vecinos en viviendas de arriendo.

create table if not exists public.rental_comments (
  id           uuid primary key default gen_random_uuid(),
  rental_id    uuid not null references public.rentals (id) on delete cascade,
  author_name  text not null default 'Anónimo',
  content      text not null check (char_length(trim(content)) > 0),
  created_at   timestamptz not null default now()
);

create index if not exists rental_comments_rental_id_idx on public.rental_comments (rental_id);
create index if not exists rental_comments_created_at_idx on public.rental_comments (created_at asc);

alter table public.rental_comments enable row level security;

drop policy if exists "rental_comments_select_public" on public.rental_comments;
create policy "rental_comments_select_public"
  on public.rental_comments for select
  using (true);

drop policy if exists "rental_comments_insert_public" on public.rental_comments;
create policy "rental_comments_insert_public"
  on public.rental_comments for insert
  with check (true);

alter table public.rental_comments replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.rental_comments;
exception
  when duplicate_object then null;
end $$;
