create table if not exists public.configuracion_app (
  id text primary key,
  monto_inicial numeric not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

insert into public.configuracion_app (id, monto_inicial)
values ('principal', 0)
on conflict (id) do nothing;

alter table public.configuracion_app enable row level security;

drop policy if exists "configuracion_app_select_public" on public.configuracion_app;
drop policy if exists "configuracion_app_insert_public" on public.configuracion_app;
drop policy if exists "configuracion_app_update_public" on public.configuracion_app;

create policy "configuracion_app_select_public"
on public.configuracion_app
for select
to anon, authenticated
using (true);

create policy "configuracion_app_insert_public"
on public.configuracion_app
for insert
to anon, authenticated
with check (true);

create policy "configuracion_app_update_public"
on public.configuracion_app
for update
to anon, authenticated
using (true)
with check (true);
