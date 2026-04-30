alter table public.clientes
add column if not exists cedula text;

create unique index if not exists clientes_cedula_unique_idx
on public.clientes (cedula)
where cedula is not null and btrim(cedula) <> '';

alter table public.prestamos
add column if not exists porcentaje_interes numeric(10,2);

update public.prestamos
set porcentaje_interes = round(
  (
    ((total_a_pagar - monto_prestado) / nullif(monto_prestado, 0)) * 100
  )::numeric,
  2
)
where porcentaje_interes is null
  and monto_prestado is not null
  and monto_prestado > 0
  and total_a_pagar is not null;
