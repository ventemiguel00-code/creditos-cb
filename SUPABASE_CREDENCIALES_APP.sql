create table if not exists public.credenciales_app (
  id text primary key,
  username text not null,
  password_hash text not null,
  updated_at timestamp with time zone not null default now()
);

insert into public.credenciales_app (id, username, password_hash)
values (
  'principal',
  'CamiloBM',
  encode(digest('12345678', 'sha256'), 'hex')
)
on conflict (id) do nothing;

alter table public.credenciales_app enable row level security;
