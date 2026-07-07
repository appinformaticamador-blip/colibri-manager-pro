-- Colibrí ERP v1.2 - Cierre manual de turnos por manager
-- Ejecutar solo si tu tabla clock_records no admite salida manual o quieres asegurar columnas.

alter table public.clock_records
add column if not exists note text;

-- Permitir método manual si la constraint vieja no lo incluyera.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'clock_records_method_check'
  ) then
    alter table public.clock_records drop constraint clock_records_method_check;
  end if;
end $$;

alter table public.clock_records
add constraint clock_records_method_check
check (method in ('gps','qr','manual'));

notify pgrst, 'reload schema';
