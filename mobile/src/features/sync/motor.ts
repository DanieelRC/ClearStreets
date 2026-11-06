import { ErrorRed, type ColaRepo, type Resultado, type SyncApi } from './tipos';

const BASE_MS = 5_000;
const MAX_MS = 30 * 60_000;

/** Backoff exponencial: 5 s, 10 s, 20 s… hasta 30 min (RF-41). */
export function siguienteIntento(intentos: number, ahora: number): number {
  return ahora + Math.min(BASE_MS * 2 ** intentos, MAX_MS);
}

export interface ResultadoSync {
  estado: 'ok' | 'parcial' | 'sin_sesion' | 'sin_red';
  subidos: number;
  fallidos: number;
}

/**
 * Una pasada de sincronización:
 * 1. recorridos con cambios locales (deben existir en el servidor antes que sus detecciones);
 * 2. detecciones de recorridos `listo` ya subidos; las descartadas se cierran sin enviarse.
 * El servidor es idempotente por id, así que reenviar es seguro.
 */
export async function sincronizar(opts: {
  repo: ColaRepo;
  api: SyncApi;
  ahora: number;
  /** Reintento manual: ignora el backoff (RF-43). */
  forzar?: boolean;
}): Promise<ResultadoSync> {
  const { repo, api, ahora, forzar = false } = opts;
  const usuario = await api.usuarioId();
  if (!usuario) return { estado: 'sin_sesion', subidos: 0, fallidos: 0 };

  const p = await repo.pendientes();
  const listo = (c: { proximoIntento: number }) => forzar || c.proximoIntento <= ahora;
  let subidos = 0;
  let fallidos = 0;
  const recorridos = { ...p.recorridosDe };

  const intentar = async (accion: () => Promise<void>, intentos: number, marcar: (r: Resultado) => Promise<void>) => {
    try {
      await accion();
      await marcar({ ok: true });
      subidos++;
      return true;
    } catch (e) {
      if (e instanceof ErrorRed) throw e;
      await marcar({ ok: false, error: e instanceof Error ? e.message : String(e), proximoIntento: siguienteIntento(intentos, ahora) });
      fallidos++;
      return false;
    }
  };

  try {
    for (const r of p.recorridos) {
      if (!r.pendiente || !listo(r)) continue;
      const ok = await intentar(() => api.subirRecorrido(r, usuario), r.intentos, (res) => repo.marcarRecorrido(r, res));
      if (ok) recorridos[r.id] = { estado: r.estado, subido: true };
    }

    for (const d of p.detecciones) {
      const rec = recorridos[d.datos.recorridoId];
      if (!rec || rec.estado !== 'listo') continue;
      if (d.datos.descartada) {
        await repo.marcarDeteccion(d.datos.id, { ok: true });
        continue;
      }
      if (!rec.subido || !listo(d)) continue;
      await intentar(() => api.registrarDeteccion(d.datos), d.intentos, (res) => repo.marcarDeteccion(d.datos.id, res));
    }
  } catch (e) {
    if (e instanceof ErrorRed) return { estado: 'sin_red', subidos, fallidos };
    throw e;
  }

  return { estado: fallidos > 0 ? 'parcial' : 'ok', subidos, fallidos };
}
