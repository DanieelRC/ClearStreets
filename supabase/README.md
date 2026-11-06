# Backend de ClearStreets (Supabase)

| Ruta | Contenido |
|---|---|
| `migrations/20261105000000_init.sql` | Esquema, PostGIS, RLS, `registrar_deteccion`, bucket de evidencias, recálculo diario de prioridad |
| `migrations/20261106000000_seguimiento_push.sql` | Seguimientos, preferencias, triggers de push (`pg_net`), borrado de cuenta |
| `migrations/20261107000000_alcaldias.sql` | Polígonos de las 16 alcaldías (INEGI 2020, CC-BY-4.0) |
| `functions/notificar` | Envía push vía Expo cuando cambia una incidencia |
| `functions/eliminar-cuenta` | El usuario elimina su cuenta |
| `admin/asignar_rol.sql` | Dar rol `operador` / `admin` a un usuario |

Todos los comandos se ejecutan desde la raíz del repositorio con `npx supabase@latest` (no hace falta instalar la CLI).

## 1. Crear el proyecto

1. En <https://supabase.com/dashboard> → **New project**. Región: la más cercana a CDMX disponible (p. ej. *East US*). Guarda la **contraseña de la base**.
2. Copia el **Project ref** (Settings → General), la **Project URL** y la **anon / publishable key** (Settings → API).

## 2. Enlazar y aplicar las migraciones

```bash
npx supabase@latest login
npx supabase@latest link --project-ref <ref>
npx supabase@latest db push --remote
```

`login` abre el navegador; `link` y `db push` piden la contraseña de la base. **`--remote` es obligatorio**: la CLI v3 aplica por defecto al stack local. Comprueba en **Table Editor** que `alcaldias` tiene 16 filas.

### Probar en local (recomendado antes de cada `db push --remote`)

Con Docker Desktop abierto:

```bash
npx supabase@latest start
npx supabase@latest test db
```

`start` aplica las migraciones en una base local (puertos 553xx, para no chocar con otros proyectos de Supabase); `test db` corre `tests/flujos.test.sql` (37 pruebas: agrupación, RLS, roles, seguimientos, historial). Studio local: <http://127.0.0.1:55323>. Para apagarlo: `npx supabase@latest stop`.

## 3. Autenticación

Authentication → **Sign In / Providers → Email**: deja habilitado el registro. Con **Confirm email** activo los ciudadanos reciben un correo de confirmación (la app ya lo indica).

## 4. Variables de la app

En `mobile/.env.local` (no se versiona):

```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
EXPO_PUBLIC_MAPBOX_TOKEN=pk.<token>
```

Para compilar con EAS, crea las mismas variables en el entorno de EAS (`npx eas-cli@latest env:create`).

## 5. Edge Functions y push

```bash
npx supabase@latest secrets set PUSH_SECRET=<cadena-aleatoria-larga>
npx supabase@latest functions deploy notificar eliminar-cuenta
```

Opcional: `EXPO_ACCESS_TOKEN` (Expo → Account settings → Access tokens) si activas *Enhanced push security* en Expo.

Luego, en Dashboard → **Project Settings → Vault** (o SQL Editor), crea dos secretos para que la base pueda llamar a `notificar`:

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/notificar', 'push_url');
select vault.create_secret('<la misma cadena de PUSH_SECRET>', 'push_secret');
```

Sin estos secretos los triggers no envían nada (no fallan).

## 6. Operadores y administradores

1. Authentication → Users → **Invite user** con el correo del operador.
2. Ejecuta `admin/asignar_rol.sql` en el SQL Editor con su correo y el rol `operador` (o `admin` para quien cambie estados).

Sin el rol `operador`, la base rechaza las detecciones automáticas de ese usuario.

## 7. Comprobaciones rápidas

En el SQL Editor:

```sql
-- Alcaldía que contiene el Zócalo → Cuauhtémoc
select nombre from alcaldias
where st_contains(geom, st_setsrid(st_makepoint(-99.1332, 19.4326), 4326));

-- Tarea diaria de prioridad registrada
select jobname, schedule from cron.job;
```
