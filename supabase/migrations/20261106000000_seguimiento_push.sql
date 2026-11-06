-- ClearStreets: seguimiento de zonas/incidencias y notificaciones push (RF-03, RF-70–72)
--
-- Requiere dos secretos en Vault (Dashboard → Project Settings → Vault):
--   push_url    = https://<proyecto>.supabase.co/functions/v1/notificar
--   push_secret = <cadena aleatoria>, igual al secreto PUSH_SECRET de la Edge Function
-- Sin ellos los triggers no envían nada (no fallan).

create extension if not exists pg_net;

-- Preferencias del usuario ----------------------------------------------------
alter table public.perfiles add column notificaciones boolean not null default true;

-- Solo columnas no sensibles son editables por el propio usuario (nunca `rol`).
revoke update on public.perfiles from authenticated;
grant update (nombre, notificaciones) on public.perfiles to authenticated;
create policy "actualiza su perfil" on public.perfiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Seguimientos ----------------------------------------------------------------
-- Restricción completa (no índice parcial) para que funcione el upsert de PostgREST;
-- las zonas tienen incidencia_id NULL y no chocan entre sí.
alter table public.seguimientos add constraint seguimientos_incidencia_unica unique (usuario_id, incidencia_id);
create index seguimientos_geom_idx on public.seguimientos using gist ((geom::extensions.geography))
  where geom is not null;

-- Máximo 10 zonas por usuario para acotar el costo de los envíos.
create function public.limitar_zonas() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.geom is not null and (
    select count(*) from public.seguimientos where usuario_id = new.usuario_id and geom is not null
  ) >= 10 then
    raise exception 'Máximo 10 zonas seguidas';
  end if;
  return new;
end $$;
create trigger antes_de_seguir_zona before insert on public.seguimientos
  for each row execute function public.limitar_zonas();

-- Borrado de cuenta (RF-03): los datos operativos se conservan sin el autor ------
alter table public.detecciones alter column usuario_id drop not null;
alter table public.detecciones drop constraint detecciones_usuario_id_fkey,
  add constraint detecciones_usuario_id_fkey foreign key (usuario_id) references public.perfiles (id) on delete set null;
alter table public.recorridos alter column operador_id drop not null;
alter table public.recorridos drop constraint recorridos_operador_id_fkey,
  add constraint recorridos_operador_id_fkey foreign key (operador_id) references public.perfiles (id) on delete set null;
alter table public.historial_estado drop constraint historial_estado_usuario_id_fkey,
  add constraint historial_estado_usuario_id_fkey foreign key (usuario_id) references public.perfiles (id) on delete set null;

-- Destinatarios (RF-71) -------------------------------------------------------
-- 'estado'     → quienes siguen la incidencia o una zona que la contiene
-- 'nueva_alta' → quienes siguen una zona que la contiene
create function public.destinatarios_push(p_incidencia_id bigint, p_evento text)
returns table (usuario_id uuid, token text)
language sql stable security definer set search_path = '' as $$
  select distinct d.usuario_id, d.token
  from public.incidencias i
  join public.seguimientos s on
       (p_evento = 'estado' and s.incidencia_id = i.id)
    or (s.geom is not null and extensions.st_dwithin(
          s.geom::extensions.geography, i.geom::extensions.geography, s.radio_m))
  join public.perfiles p on p.id = s.usuario_id and p.notificaciones
  join public.dispositivos_push d on d.usuario_id = s.usuario_id
  where i.id = p_incidencia_id
$$;
revoke execute on function public.destinatarios_push from public, anon, authenticated;

-- Disparo hacia la Edge Function `notificar` ----------------------------------
create function public.encolar_push(p_incidencia_id bigint, p_evento text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'push_url');
  v_secreto text := (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret');
begin
  if v_url is null or v_secreto is null then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secreto),
    body := jsonb_build_object('incidencia_id', p_incidencia_id, 'evento', p_evento)
  );
end $$;
revoke execute on function public.encolar_push from public, anon, authenticated;

create function public.notificar_incidencia() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    perform public.encolar_push(new.id, 'estado');
  end if;
  if new.severidad = 'alta' and new.estado <> 'resuelto'
     and (tg_op = 'INSERT' or old.severidad is distinct from 'alta') then
    perform public.encolar_push(new.id, 'nueva_alta');
  end if;
  return null;
end $$;

create trigger al_cambiar_incidencia after insert or update of estado, severidad on public.incidencias
  for each row execute function public.notificar_incidencia();

-- Tokens: el mismo dispositivo puede cambiar de usuario; el token pertenece al último.
create function public.registrar_dispositivo(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.dispositivos_push where token = p_token and usuario_id <> auth.uid();
  insert into public.dispositivos_push (usuario_id, token) values (auth.uid(), p_token)
  on conflict (usuario_id, token) do update set actualizado_en = now();
$$;
revoke execute on function public.registrar_dispositivo from public, anon;
grant execute on function public.registrar_dispositivo to authenticated;

-- API para la app ---------------------------------------------------------------
create function public.seguir_zona(p_lat double precision, p_lng double precision, p_radio_m integer)
returns bigint language sql security invoker set search_path = '' as $$
  insert into public.seguimientos (usuario_id, geom, radio_m)
  values (auth.uid(), extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326), p_radio_m)
  returning id
$$;
grant execute on function public.seguir_zona to authenticated;

create function public.mis_seguimientos()
returns table (
  id bigint, tipo text, lat double precision, lng double precision, radio_m integer,
  incidencia_id bigint, clase public.clase, severidad public.severidad, estado public.estado, alcaldia text
)
language sql stable security invoker set search_path = '' as $$
  select s.id,
         case when s.incidencia_id is null then 'zona' else 'incidencia' end,
         extensions.st_y(coalesce(s.geom, i.geom)), extensions.st_x(coalesce(s.geom, i.geom)),
         s.radio_m, s.incidencia_id, i.clase, i.severidad, i.estado, a.nombre
  from public.seguimientos s
  left join public.incidencias i on i.id = s.incidencia_id
  left join public.alcaldias a on a.id = coalesce(i.alcaldia_id, (
    select a2.id from public.alcaldias a2 where extensions.st_contains(a2.geom, s.geom) limit 1))
  where s.usuario_id = auth.uid()
  order by s.id desc
$$;
grant execute on function public.mis_seguimientos to authenticated;
