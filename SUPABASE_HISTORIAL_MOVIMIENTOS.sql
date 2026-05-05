create table if not exists public.historial_movimientos (
  id uuid primary key default gen_random_uuid(),
  fecha_hora timestamp with time zone not null default now(),
  cliente text not null default '',
  cedula text not null default '',
  prestamo_id text,
  prestamo_codigo text,
  tipo_movimiento text not null,
  valor_anterior text,
  valor_nuevo text,
  descripcion text,
  usuario text not null default 'Administrador'
);

create index if not exists historial_movimientos_fecha_idx
  on public.historial_movimientos (fecha_hora desc);

create index if not exists historial_movimientos_cedula_idx
  on public.historial_movimientos (cedula);

create index if not exists historial_movimientos_prestamo_idx
  on public.historial_movimientos (prestamo_id);
