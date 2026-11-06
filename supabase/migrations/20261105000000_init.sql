-- ClearStreets: esquema inicial (docs/requerimientos.md §5.3 y §6)

create extension if not exists postgis with schema extensions;

-- Tipos -----------------------------------------------------------------------
create type public.clase as enum ('bache', 'basura');
create type public.severidad as enum ('baja', 'media', 'alta');
create type public.estado as enum ('pendiente', 'en_proceso', 'resuelto');
create type public.origen as enum ('auto', 'manual', 'ciudadano');
create type public.rol as enum ('operador', 'ciudadano', 'admin');

-- Tablas ----------------------------------------------------------------------
create table public.alcaldias (
  id smallint primary key,
  nombre text not null unique,
  geom extensions.geometry(MultiPolygon, 4326) not null
);
create index alcaldias_geom_idx on public.alcaldias using gist (geom);

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  rol public.rol not null default 'ciudadano',
  alcaldia_id smallint references public.alcaldias (id),
  nombre text,
  creado_en timestamptz not null default now()
);

create table public.recorridos (
  id uuid primary key,
  operador_id uuid not null references public.perfiles (id),
  inicio timestamptz not null,
  fin timestamptz,
  trazo extensions.geometry(LineString, 4326),
  distancia_m real,
  dispositivo text,
  app_version text
);

create table public.incidencias (
  id bigint generated always as identity primary key,
  clase public.clase not null,
  severidad public.severidad not null,
  estado public.estado not null default 'pendiente',
  geom extensions.geometry(Point, 4326) not null,
  alcaldia_id smallint references public.alcaldias (id),
  frecuencia integer not null default 1,
  prioridad real not null default 0,
  primera_deteccion timestamptz not null default now(),
  ultima_deteccion timestamptz not null default now(),
  resuelta_en timestamptz,
  incidencia_previa_id bigint references public.incidencias (id)
);
create index incidencias_geom_idx on public.incidencias using gist (geom);
create index incidencias_estado_idx on public.incidencias (estado, prioridad desc);

create table public.detecciones (
  id uuid primary key, -- generado en el dispositivo (envío idempotente, RF-41)
  incidencia_id bigint not null references public.incidencias (id) on delete cascade,
  recorrido_id uuid references public.recorridos (id),
  usuario_id uuid not null references public.perfiles (id),
  origen public.origen not null,
  clase public.clase not null,
  confianza real not null check (confianza between 0 and 1),
  bbox real[4],
  geom extensions.geometry(Point, 4326) not null,
  precision_m real,
  rumbo real,
  velocidad real,
  severidad public.severidad not null,
  verificado boolean not null default true,
  modelo_version text,
  evidencia_path text,
  capturada_en timestamptz not null,
  recibida_en timestamptz not null default now()
);
create index detecciones_incidencia_idx on public.detecciones (incidencia_id);

create table public.historial_estado (
  id bigint generated always as identity primary key,
  incidencia_id bigint not null references public.incidencias (id) on delete cascade,
  estado_anterior public.estado,
  estado_nuevo public.estado not null,
  usuario_id uuid references public.perfiles (id),
  nota text,
  fecha timestamptz not null default now()
);

create table public.seguimientos (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  geom extensions.geometry(Point, 4326),
  radio_m integer check (radio_m between 100 and 500),
  incidencia_id bigint references public.incidencias (id) on delete cascade,
  check ((geom is not null and radio_m is not null) or incidencia_id is not null)
);

create table public.dispositivos_push (
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  token text not null,
  plataforma text not null default 'android',
  actualizado_en timestamptz not null default now(),
  primary key (usuario_id, token)
);

create table public.configuracion (
  clave text primary key,
  valor jsonb not null
);

insert into public.configuracion (clave, valor) values
  ('radio_agrupacion_m', '10'),
  ('severidad', '{"bache":[0.02,0.06],"basura":[0.03,0.1],"k":1}'),
  ('confianza_min', '{"bache":0.5,"basura":0.5}'),
  ('retencion_dias', '{"resuelto":30,"descartado":7}'),
  ('penalizacion_ruta_s', '{"alta":120,"media":45,"baja":0}');

-- Perfil automático al registrarse --------------------------------------------
create function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, rol, nombre)
  values (
    new.id,
    coalesce((new.raw_app_meta_data ->> 'rol')::public.rol, 'ciudadano'),
    new.raw_user_meta_data ->> 'nombre'
  );
  return new;
end $$;

create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil();

create function public.rol_actual() returns public.rol
language sql stable security definer set search_path = '' as $$
  select rol from public.perfiles where id = auth.uid()
$$;

-- Prioridad (§3.6, igual que src/domain/priority.ts) ---------------------------
create function public.calcular_prioridad(sev public.severidad, frecuencia int, primera timestamptz)
returns real language sql stable as $$
  select (
    50 * case sev when 'alta' then 1.0 when 'media' then 0.66 else 0.33 end
    + 30 * least(1, log(1 + frecuencia) / log(11))
    + 20 * least(1, extract(epoch from (now() - primera)) / 86400 / 30)
  )::real
$$;

-- La antigüedad cambia la prioridad aunque no haya detecciones nuevas: recálculo diario (§5.3).
create extension if not exists pg_cron;
select cron.schedule(
  'recalcular-prioridad', '0 4 * * *',
  $$update public.incidencias
    set prioridad = public.calcular_prioridad(severidad, frecuencia, primera_deteccion)
    where estado <> 'resuelto'$$
);

-- Registrar detección: agrupa ≤ radio, asigna alcaldía, recalcula (RF-50–53) ---
create function public.registrar_deteccion(
  p_id uuid,
  p_recorrido_id uuid,
  p_origen public.origen,
  p_clase public.clase,
  p_confianza real,
  p_bbox real[],
  p_lat double precision,
  p_lng double precision,
  p_precision_m real,
  p_rumbo real,
  p_velocidad real,
  p_severidad public.severidad,
  p_verificado boolean,
  p_modelo_version text,
  p_evidencia_path text,
  p_capturada_en timestamptz
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_punto extensions.geometry := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);
  v_radio real := (select valor::text::real from public.configuracion where clave = 'radio_agrupacion_m');
  v_inc bigint;
  -- coalesce: sin perfil, NULL NOT IN (...) es NULL y la validación se saltaría.
  v_rol public.rol := coalesce(public.rol_actual(), 'ciudadano');
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  if p_origen in ('auto', 'manual') and v_rol not in ('operador', 'admin') then
    raise exception 'solo operadores registran detecciones automáticas';
  end if;
  if p_recorrido_id is not null and not exists (
    select 1 from public.recorridos where id = p_recorrido_id and operador_id = auth.uid()
  ) then
    raise exception 'recorrido inexistente o de otro operador';
  end if;

  -- Idempotencia: reenvío de la misma detección.
  select incidencia_id into v_inc from public.detecciones where id = p_id;
  if found then return v_inc; end if;

  select i.id into v_inc
  from public.incidencias i
  where i.clase = p_clase
    and i.estado <> 'resuelto'
    and extensions.st_dwithin(i.geom::extensions.geography, v_punto::extensions.geography, v_radio)
  -- st_distance y no el operador KNN <->: con FOR UPDATE, el recorrido KNN del índice puede
  -- devolver una versión vieja de la fila ("attempted to lock invisible tuple").
  order by extensions.st_distance(i.geom::extensions.geography, v_punto::extensions.geography)
  limit 1
  for update;

  if v_inc is null then
    insert into public.incidencias (clase, severidad, geom, alcaldia_id, primera_deteccion, ultima_deteccion)
    values (
      p_clase, p_severidad, v_punto,
      (select a.id from public.alcaldias a where extensions.st_contains(a.geom, v_punto) limit 1),
      p_capturada_en, p_capturada_en
    )
    returning id into v_inc;
  else
    update public.incidencias set
      frecuencia = frecuencia + 1,
      ultima_deteccion = greatest(ultima_deteccion, p_capturada_en),
      severidad = greatest(severidad, p_severidad)
    where id = v_inc;
  end if;

  insert into public.detecciones (
    id, incidencia_id, recorrido_id, usuario_id, origen, clase, confianza, bbox, geom,
    precision_m, rumbo, velocidad, severidad, verificado, modelo_version, evidencia_path, capturada_en
  ) values (
    p_id, v_inc, p_recorrido_id, auth.uid(), p_origen, p_clase, p_confianza, p_bbox, v_punto,
    p_precision_m, p_rumbo, p_velocidad, p_severidad, p_verificado, p_modelo_version, p_evidencia_path, p_capturada_en
  );

  update public.incidencias
  set prioridad = public.calcular_prioridad(severidad, frecuencia, primera_deteccion)
  where id = v_inc;

  return v_inc;
end $$;

-- Consultas para el mapa y alertas (RF-60, RF-82) -----------------------------
create function public.incidencias_cercanas(p_lat double precision, p_lng double precision, p_radio_m real default 5000)
returns table (
  id bigint, clase public.clase, severidad public.severidad, estado public.estado,
  lat double precision, lng double precision, frecuencia int, prioridad real, alcaldia text
)
language sql stable set search_path = '' as $$
  select i.id, i.clase, i.severidad, i.estado,
         extensions.st_y(i.geom), extensions.st_x(i.geom), i.frecuencia, i.prioridad, a.nombre
  from public.incidencias i
  left join public.alcaldias a on a.id = i.alcaldia_id
  where extensions.st_dwithin(
    i.geom::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
    least(p_radio_m, 20000)
  )
$$;

-- Historial automático de estados ---------------------------------------------
create function public.registrar_cambio_estado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado is distinct from old.estado then
    insert into public.historial_estado (incidencia_id, estado_anterior, estado_nuevo, usuario_id)
    values (new.id, old.estado, new.estado, auth.uid());
    if new.estado = 'resuelto' then new.resuelta_en := now(); end if;
  end if;
  return new;
end $$;

create trigger al_cambiar_estado before update of estado on public.incidencias
  for each row execute function public.registrar_cambio_estado();

-- Row Level Security (RNF-10) -------------------------------------------------
alter table public.alcaldias enable row level security;
alter table public.perfiles enable row level security;
alter table public.recorridos enable row level security;
alter table public.incidencias enable row level security;
alter table public.detecciones enable row level security;
alter table public.historial_estado enable row level security;
alter table public.seguimientos enable row level security;
alter table public.dispositivos_push enable row level security;
alter table public.configuracion enable row level security;

-- Datos públicos de consulta
create policy "lectura publica" on public.alcaldias for select using (true);
create policy "lectura publica" on public.incidencias for select using (true);
create policy "lectura publica" on public.historial_estado for select using (true);
create policy "lectura publica" on public.configuracion for select using (true);

-- Solo el admin cambia estados (el panel web usará este rol)
create policy "admin actualiza" on public.incidencias for update
  using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');

-- Perfil propio
create policy "perfil propio" on public.perfiles for select using (id = auth.uid());

-- Recorridos del operador
create policy "operador lee sus recorridos" on public.recorridos for select using (operador_id = auth.uid());
create policy "operador crea recorridos" on public.recorridos for insert
  with check (operador_id = auth.uid() and public.rol_actual() in ('operador', 'admin'));
create policy "operador actualiza recorridos" on public.recorridos for update
  using (operador_id = auth.uid()) with check (operador_id = auth.uid());

-- Detecciones: se insertan solo vía registrar_deteccion; el autor puede leer las suyas
create policy "autor lee sus detecciones" on public.detecciones for select using (usuario_id = auth.uid());

-- Seguimientos y tokens propios
create policy "seguimientos propios" on public.seguimientos for all
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "tokens propios" on public.dispositivos_push for all
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Supabase concede EXECUTE a anon en toda función nueva de public: se revoca explícitamente.
revoke execute on function public.registrar_deteccion from public, anon;
grant execute on function public.registrar_deteccion to authenticated;
grant execute on function public.incidencias_cercanas to anon, authenticated;

-- Storage de evidencias (privado; ruta = <usuario_id>/<deteccion_id>.jpg) -----
insert into storage.buckets (id, name, public) values ('evidencias', 'evidencias', false);

create policy "subir evidencia propia" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "leer evidencias" on storage.objects for select to anon, authenticated
  using (bucket_id = 'evidencias');
