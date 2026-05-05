do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'clientes'
  ) then
    alter publication supabase_realtime add table public.clientes;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'prestamos'
  ) then
    alter publication supabase_realtime add table public.prestamos;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pagos'
  ) then
    alter publication supabase_realtime add table public.pagos;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'historial_movimientos'
  ) then
    alter publication supabase_realtime add table public.historial_movimientos;
  end if;
end $$;

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('clientes', 'prestamos', 'pagos', 'historial_movimientos')
order by tablename;
