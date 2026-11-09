-- SEALE weekly meeting availability poll – initial schema.
-- Run once in the Supabase SQL editor (or `supabase db push`).
--
-- Slots are stored as (ISO weekday, start hour) in Europe/Berlin wall-clock
-- time – never as UTC – so DST changes do not shift them.
-- All access goes through server-side routes using DATABASE_URL; RLS is ON
-- with no policies, so the public anon/authenticated roles can read nothing.

create type slot_preference as enum ('available', 'if_needed');

create table poll (
  id          uuid primary key default gen_random_uuid(),
  -- single-poll app: at most one row
  singleton   boolean not null default true check (singleton),
  title       text not null,
  deadline_at timestamptz,                    -- null = open
  slot_config jsonb not null,                 -- snapshot of the grid config
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint poll_singleton unique (singleton)
);

create table response (
  id              uuid primary key default gen_random_uuid(),
  poll_id         uuid not null references poll(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 100),
  -- normalize(name) || U+001F || normalize(organization)
  name_key        text not null check (char_length(name_key) between 3 and 600),
  organization    text not null check (char_length(organization) between 1 and 150),
  country         char(2) not null check (country ~ '^[A-Z]{2}$'),
  timezone        text not null check (char_length(timezone) between 1 and 64),
  -- sha256 hex of the edit token; the raw token only lives in the browser
  edit_token_hash text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint response_name_key_per_poll unique (poll_id, name_key)
);

create index response_edit_token_idx on response (poll_id, edit_token_hash);

create table response_slot (
  response_id uuid not null references response(id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),   -- ISO, Europe/Berlin
  start_hour  smallint not null check (start_hour between 0 and 23), -- Europe/Berlin
  preference  slot_preference not null,
  primary key (response_id, weekday, start_hour)
);

-- Submit rate limiting. Stores an HMAC of the IP, never the IP itself.
create table rate_limit (
  bucket_key   text not null,
  window_start timestamptz not null,
  hits         integer not null default 1,
  primary key (bucket_key, window_start)
);

alter table poll          enable row level security;
alter table response      enable row level security;
alter table response_slot enable row level security;
alter table rate_limit    enable row level security;

-- Belt and braces: no privileges for Supabase's public API roles.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on poll, response, response_slot, rate_limit from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on poll, response, response_slot, rate_limit from authenticated';
  end if;
end
$$;
