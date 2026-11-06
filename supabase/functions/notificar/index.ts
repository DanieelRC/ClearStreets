// Edge Function: envía push vía Expo cuando una incidencia cambia (RF-71).
// La invoca el trigger `notificar_incidencia` (pg_net) con Authorization: Bearer <PUSH_SECRET>.
// Secretos: PUSH_SECRET, EXPO_ACCESS_TOKEN (opcional). SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los provee Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { construirMensajes, eventoValido, lotes, tokensInvalidos, type InfoIncidencia, type Ticket } from '../_shared/push.ts';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  const secreto = Deno.env.get('PUSH_SECRET');
  if (!secreto || req.headers.get('Authorization') !== `Bearer ${secreto}`) {
    return new Response('No autorizado', { status: 401 });
  }

  const { incidencia_id, evento } = await req.json().catch(() => ({}));
  if (!Number.isInteger(incidencia_id) || !eventoValido(evento)) {
    return new Response('Solicitud inválida', { status: 400 });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: inc, error: e1 } = await db
    .from('incidencias')
    .select('id, clase, severidad, estado, alcaldia:alcaldias(nombre)')
    .eq('id', incidencia_id)
    .single();
  if (e1 || !inc) return new Response(e1?.message ?? 'No encontrada', { status: 404 });

  const { data: dest, error: e2 } = await db.rpc('destinatarios_push', { p_incidencia_id: incidencia_id, p_evento: evento });
  if (e2) return new Response(e2.message, { status: 500 });

  const info: InfoIncidencia = {
    id: inc.id,
    clase: inc.clase,
    severidad: inc.severidad,
    estado: inc.estado,
    alcaldia: (inc.alcaldia as unknown as { nombre: string } | null)?.nombre ?? null,
  };
  const mensajes = construirMensajes(evento, info, (dest ?? []).map((d: { token: string }) => d.token));

  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  let enviados = 0;
  const invalidos: string[] = [];
  for (const lote of lotes(mensajes)) {
    const r = await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(expoToken ? { Authorization: `Bearer ${expoToken}` } : {}),
      },
      body: JSON.stringify(lote),
    });
    if (!r.ok) {
      console.error('Expo push', r.status, await r.text());
      continue;
    }
    const { data } = (await r.json()) as { data: Ticket[] };
    enviados += data.filter((t) => t.status === 'ok').length;
    invalidos.push(...tokensInvalidos(lote, data));
  }

  if (invalidos.length) await db.from('dispositivos_push').delete().in('token', invalidos);

  return Response.json({ destinatarios: mensajes.length, enviados, invalidos: invalidos.length });
});
