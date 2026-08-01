-- COLIBRÍ ERP RC 4.0.2 — Portal completo del empleado
-- Ejecutar una sola vez en Supabase SQL Editor.

create table if not exists public.clock_adjustment_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete restrict,
  employee_name text not null,
  request_type text not null check (request_type in ('entrada_olvidada','salida_olvidada','hora_extra')),
  requested_at timestamptz not null,
  reason text not null,
  status text not null default 'pendiente' check (status in ('pendiente','aprobada','rechazada')),
  manager_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists clock_adjustment_requests_employee_idx on public.clock_adjustment_requests(employee_id,created_at desc);
create index if not exists clock_adjustment_requests_status_idx on public.clock_adjustment_requests(status,created_at desc);

alter table public.clock_adjustment_requests enable row level security;
drop policy if exists "portal puede crear solicitudes" on public.clock_adjustment_requests;
create policy "portal puede crear solicitudes" on public.clock_adjustment_requests for insert to anon,authenticated with check (status='pendiente');
drop policy if exists "manager puede leer solicitudes" on public.clock_adjustment_requests;
create policy "manager puede leer solicitudes" on public.clock_adjustment_requests for select to anon,authenticated using (true);
drop policy if exists "manager puede actualizar solicitudes" on public.clock_adjustment_requests;
create policy "manager puede actualizar solicitudes" on public.clock_adjustment_requests for update to anon,authenticated using (true) with check (true);

-- Fichaje desde una sesión ya validada en el portal. Conserva las mismas comprobaciones GPS de la función actual.
create or replace function public.registrar_fichaje_portal(
 p_employee_id uuid,p_type text,p_note text default null,p_gps_lat double precision default null,p_gps_lng double precision default null,p_accuracy double precision default null,p_method text default 'gps'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.employees%rowtype; result jsonb;
begin
 select * into e from public.employees where id=p_employee_id and active=true and can_clock=true;
 if not found then return jsonb_build_object('ok',false,'message','Empleado no disponible'); end if;
 -- Reutiliza la función estable existente para no duplicar las reglas de radio/QR.
 select public.registrar_fichaje_v2(e.name,e.pin,p_type,p_note,p_gps_lat,p_gps_lng,p_accuracy,p_method) into result;
 return result;
end $$;
grant execute on function public.registrar_fichaje_portal(uuid,text,text,double precision,double precision,double precision,text) to anon,authenticated;
