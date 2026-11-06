-- Asigna rol a un usuario existente. Ejecutar en Dashboard → SQL Editor (rol postgres).
-- Flujo para operadores (RF-01): Authentication → Users → "Invite user" con su correo,
-- y luego ejecutar esto con su correo (la invitación crea el usuario al instante).
--
-- Roles: 'operador' (registra recorridos), 'admin' (cambia estados de incidencias), 'ciudadano' (por defecto).

update public.perfiles p
set rol = 'operador'                       -- ← rol a asignar
from auth.users u
where u.id = p.id
  and u.email = 'correo@ejemplo.com'       -- ← correo del usuario
returning u.email, p.rol;

-- Si no devuelve filas, no existe un usuario con ese correo.
