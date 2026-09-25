-- Baseline snapshot of the live Supabase project (qflqfvoxdzkibpzfrwop) as of 2026-09-25,
-- captured from the catalog after the security lock-down. Idempotent: safe to run on a fresh
-- project to recreate the backend; it is a no-op on the live one. Data is not included.
-- Access model: RLS is ON with NO policies for every table, and anon/authenticated hold no
-- grants. Only the edge functions (service_role) touch these tables. See
-- context/references/supabase-backend.md.

-- Per-session bookmarks (edge function: atlas-bookmarks)
create table if not exists public.atlas_bookmarks (
  id uuid not null default gen_random_uuid(),
  session_id text not null,
  item_kind varchar(40) not null,
  item_id varchar(160) not null,
  label varchar(240),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_bookmarks_pkey primary key (id),
  constraint atlas_bookmarks_session_id_item_kind_item_id_key unique (session_id, item_kind, item_id)
);
create index if not exists atlas_bookmarks_session_updated_idx
  on public.atlas_bookmarks using btree (session_id, updated_at desc);

-- Per-session UI state (edge function: atlas-state)
create table if not exists public.atlas_session_state (
  session_id text not null,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint atlas_session_state_pkey primary key (session_id)
);

-- Aggregate performance telemetry (edge function: atlas-telemetry -> atlas_upsert_telemetry)
create table if not exists public.atlas_telemetry_metrics (
  name text not null,
  count bigint not null default 0,
  sum double precision not null default 0,
  max double precision not null default 0,
  updated_at timestamptz not null default now(),
  constraint atlas_telemetry_metrics_pkey primary key (name)
);
create table if not exists public.atlas_telemetry_sessions (
  id smallint not null default 1,
  sessions bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint atlas_telemetry_sessions_pkey primary key (id)
);

-- Fandom wiki match cache (edge function: fandom-sync)
create table if not exists public.fandom_entity_cache (
  entity_type text not null,
  entity_id text not null,
  canonical_name text not null,
  fandom_title text,
  fandom_url text,
  fandom_revision text,
  image_urls jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  sync_status text not null default 'ok',
  error_message text,
  synced_at timestamptz not null default now(),
  constraint fandom_entity_cache_pkey primary key (entity_type, entity_id),
  constraint fandom_entity_cache_entity_type_check
    check (entity_type = any (array['characters'::text, 'locations'::text, 'episodes'::text])),
  constraint fandom_entity_cache_sync_status_check
    check (sync_status = any (array['ok'::text, 'missing'::text, 'error'::text]))
);
create index if not exists fandom_entity_cache_name_idx
  on public.fandom_entity_cache using gin (to_tsvector('simple'::regconfig, canonical_name));
create index if not exists fandom_entity_cache_synced_idx
  on public.fandom_entity_cache using btree (synced_at desc);

alter table public.atlas_bookmarks enable row level security;
alter table public.atlas_session_state enable row level security;
alter table public.atlas_telemetry_metrics enable row level security;
alter table public.atlas_telemetry_sessions enable row level security;
alter table public.fandom_entity_cache enable row level security;

-- Telemetry upsert. SECURITY DEFINER, callable by service_role ONLY (the edge function
-- validates size/shape before calling it; direct anon RPC would bypass that validation).
create or replace function public.atlas_upsert_telemetry(p_metrics jsonb, p_session_increment bigint default 1)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  item jsonb;
  metric_name text;
  metric_value double precision;
begin
  insert into public.atlas_telemetry_sessions(id, sessions, updated_at)
  values (1, least(greatest(p_session_increment,0),10000000), now())
  on conflict (id) do update set
    sessions = least(public.atlas_telemetry_sessions.sessions + excluded.sessions, 10000000),
    updated_at = now();

  for item in select * from jsonb_array_elements(p_metrics)
  loop
    metric_name := item->>'name';
    metric_value := (item->>'value')::double precision;
    insert into public.atlas_telemetry_metrics(name,count,sum,max,updated_at)
    values (metric_name,1,metric_value,metric_value,now())
    on conflict (name) do update set
      count = public.atlas_telemetry_metrics.count + 1,
      sum = public.atlas_telemetry_metrics.sum + excluded.sum,
      max = greatest(public.atlas_telemetry_metrics.max, excluded.max),
      updated_at = now();
  end loop;
end;
$function$;

-- Lock-down (applied live as migration lock_down_telemetry_rpc_and_anon_grants).
revoke execute on function public.atlas_upsert_telemetry(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.atlas_upsert_telemetry(jsonb, bigint) to service_role;
revoke all on all tables in schema public from anon, authenticated;
