// Lógica pura de notificaciones (sin APIs de Deno), probada con `node --test`.

export type Evento = 'estado' | 'nueva_alta';

export interface InfoIncidencia {
  id: number;
  clase: 'bache' | 'basura';
  severidad: 'baja' | 'media' | 'alta';
  estado: 'pendiente' | 'en_proceso' | 'resuelto';
  alcaldia: string | null;
}

export interface MensajeExpo {
  to: string;
  title: string;
  body: string;
  data: { incidenciaId: number };
  channelId: 'incidencias';
  sound: 'default';
  priority: 'high' | 'default';
}

export type Ticket = { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };

const CLASE = { bache: 'Bache', basura: 'Basura acumulada' } as const;
const ESTADO = { pendiente: 'Pendiente', en_proceso: 'En proceso', resuelto: 'Resuelto' } as const;

export function construirTexto(evento: Evento, i: InfoIncidencia): { title: string; body: string } {
  const lugar = i.alcaldia ? ` en ${i.alcaldia}` : '';
  if (evento === 'nueva_alta') {
    return {
      title: `${CLASE[i.clase]} de severidad alta${lugar}`,
      body: 'Se detectó en una zona que sigues. Toca para ver dónde está.',
    };
  }
  if (i.estado === 'resuelto') {
    return { title: `${CLASE[i.clase]} resuelto${lugar}`, body: `La incidencia #${i.id} que sigues ya fue atendida.` };
  }
  return {
    title: `${CLASE[i.clase]}${lugar}: ${ESTADO[i.estado]}`,
    body: `La incidencia #${i.id} que sigues cambió a «${ESTADO[i.estado]}».`,
  };
}

export function construirMensajes(evento: Evento, i: InfoIncidencia, tokens: string[]): MensajeExpo[] {
  const { title, body } = construirTexto(evento, i);
  return [...new Set(tokens)].map((to) => ({
    to,
    title,
    body,
    data: { incidenciaId: i.id },
    channelId: 'incidencias',
    sound: 'default',
    priority: evento === 'nueva_alta' ? 'high' : 'default',
  }));
}

/** La API de Expo acepta hasta 100 mensajes por solicitud. */
export function lotes<T>(xs: T[], n = 100): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < xs.length; i += n) r.push(xs.slice(i, i + n));
  return r;
}

/** Tokens a borrar: los tickets vienen en el mismo orden que los mensajes. */
export function tokensInvalidos(mensajes: MensajeExpo[], tickets: Ticket[]): string[] {
  return tickets.flatMap((t, k) =>
    t.status === 'error' && t.details?.error === 'DeviceNotRegistered' && mensajes[k] ? [mensajes[k].to] : [],
  );
}

export function eventoValido(x: unknown): x is Evento {
  return x === 'estado' || x === 'nueva_alta';
}
