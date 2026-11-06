-- Pruebas de la base (pgTAP). Ejecutar con: npx supabase@latest test db
-- Todo corre en una transacción que se revierte al final.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- Usuarios de prueba (el trigger crea sus perfiles como 'ciudadano').
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'operador@test.mx'),
  ('00000000-0000-0000-0000-00000000000b', 'ciudadano@test.mx'),
  ('00000000-0000-0000-0000-00000000000c', 'admin@test.mx'),
  ('00000000-0000-0000-0000-00000000000d', 'otro-operador@test.mx');
update public.perfiles set rol = 'operador' where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d');
update public.perfiles set rol = 'admin' where id = '00000000-0000-0000-0000-00000000000c';

select is((select count(*)::int from public.perfiles), 4, 'el trigger crea un perfil por usuario');

-- Alcaldías ----------------------------------------------------------------------
select is((select count(*)::int from public.alcaldias), 16, '16 alcaldías cargadas');
select is(
  (select nombre from public.alcaldias where extensions.st_contains(geom, extensions.st_setsrid(extensions.st_makepoint(-99.1332, 19.4326), 4326))),
  'Cuauhtémoc', 'el Zócalo cae en Cuauhtémoc');

-- Operador: recorrido y detecciones ------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok($$
  insert into public.recorridos (id, operador_id, inicio) values ('10000000-0000-0000-0000-000000000001', auth.uid(), now())
$$, 'el operador crea su recorrido');

select lives_ok($$
  select public.registrar_deteccion('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'auto', 'bache',
    0.9, '{0.5,0.5,0.1,0.1}', 19.4326, -99.1332, 5, 0, 8, 'media', true, 'v1', null, now())
$$, 'registra la primera detección');

-- ~5 m al norte: misma incidencia
select is(
  public.registrar_deteccion('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'auto', 'bache',
    0.9, '{0.5,0.5,0.1,0.1}', 19.43265, -99.1332, 5, 0, 8, 'alta', true, 'v1', null, now()),
  (select incidencia_id from public.detecciones where id = '20000000-0000-0000-0000-000000000001'),
  'una detección a ≤10 m se agrupa en la misma incidencia');

select is(
  (select frecuencia from public.incidencias where id = (select incidencia_id from public.detecciones where id = '20000000-0000-0000-0000-000000000001')),
  2, 'la frecuencia sube a 2');

select is(
  (select severidad::text from public.incidencias where id = (select incidencia_id from public.detecciones where id = '20000000-0000-0000-0000-000000000001')),
  'alta', 'la severidad toma la máxima');

-- Reenvío idempotente
select is(
  public.registrar_deteccion('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'auto', 'bache',
    0.9, '{0.5,0.5,0.1,0.1}', 19.43265, -99.1332, 5, 0, 8, 'alta', true, 'v1', null, now()),
  (select incidencia_id from public.detecciones where id = '20000000-0000-0000-0000-000000000002'),
  'reenviar la misma detección devuelve la misma incidencia');
select is((select frecuencia from public.incidencias where id = (select incidencia_id from public.detecciones where id = '20000000-0000-0000-0000-000000000001')),
  2, 'el reenvío no cuenta doble');

-- ~55 m al norte: incidencia nueva; basura en el mismo punto: incidencia aparte
select isnt(
  public.registrar_deteccion('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'auto', 'bache',
    0.9, '{0.5,0.5,0.1,0.1}', 19.4331, -99.1332, 5, 0, 8, 'baja', true, 'v1', null, now()),
  (select incidencia_id from public.detecciones where id = '20000000-0000-0000-0000-000000000001'),
  'a más de 10 m se crea otra incidencia');
select isnt(
  public.registrar_deteccion('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'auto', 'basura',
    0.9, '{0.5,0.5,0.1,0.1}', 19.4326, -99.1332, 5, 0, 8, 'media', true, 'v1', null, now()),
  (select incidencia_id from public.detecciones where id = '20000000-0000-0000-0000-000000000001'),
  'otra clase en el mismo punto es otra incidencia');

select is(
  (select a.nombre from public.incidencias i join public.alcaldias a on a.id = i.alcaldia_id
   where i.id = (select incidencia_id from public.detecciones where id = '20000000-0000-0000-0000-000000000001')),
  'Cuauhtémoc', 'la incidencia se asigna a su alcaldía');

select ok(
  (select prioridad > 0 from public.incidencias where id = (select incidencia_id from public.detecciones where id = '20000000-0000-0000-0000-000000000001')),
  'se calcula la prioridad');

-- Otro operador no puede usar ese recorrido
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
select throws_like($$
  select public.registrar_deteccion('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 'auto', 'bache',
    0.9, '{0.5,0.5,0.1,0.1}', 19.4326, -99.1332, 5, 0, 8, 'media', true, 'v1', null, now())
$$, '%otro operador%', 'no se puede usar el recorrido de otro operador');
select is((select count(*)::int from public.detecciones), 0, 'un operador no ve detecciones ajenas (RLS)');

-- Ciudadano: no registra automáticas, no cambia estados, no se sube el rol ------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_like($$
  select public.registrar_deteccion('20000000-0000-0000-0000-000000000010', null, 'auto', 'bache',
    0.9, '{0.5,0.5,0.1,0.1}', 19.4326, -99.1332, 5, 0, 8, 'media', true, 'v1', null, now())
$$, '%solo operadores%', 'un ciudadano no registra detecciones automáticas');

select throws_ok($$ update public.perfiles set rol = 'admin' where id = auth.uid() $$, '42501', null,
  'un usuario no puede cambiarse el rol');
select lives_ok($$ update public.perfiles set notificaciones = false where id = auth.uid() $$, 'sí puede apagar sus notificaciones');

update public.incidencias set estado = 'resuelto';
select is((select count(*)::int from public.incidencias where estado = 'resuelto'), 0, 'un ciudadano no cambia estados (RLS)');

-- Usuario autenticado sin perfil (corrección de la auditoría)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
select throws_like($$
  select public.registrar_deteccion('20000000-0000-0000-0000-000000000011', null, 'auto', 'bache',
    0.9, '{0.5,0.5,0.1,0.1}', 19.4326, -99.1332, 5, 0, 8, 'media', true, 'v1', null, now())
$$, '%solo operadores%', 'sin perfil tampoco se registran detecciones automáticas');

-- Anónimo: consulta pública ----------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.incidencias_cercanas(19.4326, -99.1332, 5000)), 3, 'anónimo consulta incidencias cercanas');
select is((select alcaldia from public.incidencias_cercanas(19.4326, -99.1332, 5000) limit 1), 'Cuauhtémoc', 'con nombre de alcaldía');
select throws_ok($$ select public.registrar_deteccion('20000000-0000-0000-0000-000000000012', null, 'ciudadano', 'bache',
    0.9, '{0.5,0.5,0.1,0.1}', 19.4326, -99.1332, 5, 0, 8, 'media', true, 'v1', null, now()) $$,
  '42501', null, 'anónimo no puede ejecutar registrar_deteccion');
select throws_ok($$ select public.seguir_zona(19.4326, -99.1332, 250) $$, '42501', null, 'anónimo no puede seguir zonas');

-- Ciudadano: seguimientos y dispositivos ------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
update public.perfiles set notificaciones = true where id = auth.uid();
select lives_ok($$ select public.seguir_zona(19.4326, -99.1332, 250) $$, 'sigue una zona');
select lives_ok($$ select public.registrar_dispositivo('ExponentPushToken[ciudadano]') $$, 'registra su dispositivo');
select lives_ok($$
  insert into public.seguimientos (usuario_id, incidencia_id)
  select auth.uid(), incidencia_id from public.detecciones where false
$$, 'insert vacío no falla');
select is((select count(*)::int from public.mis_seguimientos()), 1, 'mis_seguimientos devuelve la zona');
select is((select alcaldia from public.mis_seguimientos() limit 1), 'Cuauhtémoc', 'la zona muestra su alcaldía');
select throws_like($$
  select public.seguir_zona(19.4326, -99.1332, 100) from generate_series(1, 10)
$$, '%Máximo 10 zonas%', 'máximo 10 zonas por usuario');

-- Admin: cambio de estado, historial y destinatarios -------------------------------------
reset role;
select is(
  (select count(*)::int from public.destinatarios_push(
    (select incidencia_id from public.detecciones where id = '20000000-0000-0000-0000-000000000001'), 'estado')),
  1, 'el ciudadano que sigue la zona es destinatario');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select lives_ok($$
  update public.incidencias set estado = 'resuelto'
  where id = (select i.id from public.incidencias i order by i.id limit 1)
$$, 'el admin cambia el estado (sin secretos de Vault el push no se envía y no falla)');
reset role;
select is((select count(*)::int from public.historial_estado where estado_nuevo = 'resuelto'), 1, 'queda en el historial');
select ok((select resuelta_en is not null from public.incidencias order by id limit 1), 'se registra la fecha de resolución');

-- Infraestructura ------------------------------------------------------------------------
select is((select count(*)::int from cron.job where jobname = 'recalcular-prioridad'), 1, 'tarea diaria de prioridad programada');

-- Borrar la cuenta del operador conserva sus detecciones sin autor
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.detecciones where usuario_id is null), 4, 'las detecciones se conservan sin autor');

select * from finish();
rollback;
