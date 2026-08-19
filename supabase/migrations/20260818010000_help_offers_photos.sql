alter table public.help_offers
  add column if not exists photo_urls text[] not null default '{}';
