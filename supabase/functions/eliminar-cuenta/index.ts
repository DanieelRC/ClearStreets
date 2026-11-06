// Edge Function: el usuario autenticado elimina su propia cuenta (RF-03).
// Borra auth.users → perfiles, seguimientos y tokens en cascada; detecciones y recorridos
// se conservan sin autor (on delete set null).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405, headers: cors });

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!jwt) return new Response('No autorizado', { status: 401, headers: cors });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return new Response('No autorizado', { status: 401, headers: cors });

  const { error: e } = await admin.auth.admin.deleteUser(data.user.id);
  if (e) return new Response(e.message, { status: 500, headers: cors });

  return Response.json({ ok: true }, { headers: cors });
});
