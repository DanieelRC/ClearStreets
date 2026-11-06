import Constants from 'expo-constants';

import type { LatLng } from '@/domain/types';
import { supabase } from '@/lib/supabase';

import { ErrorRed, type SyncApi } from './tipos';

const esErrorDeRed = (m: string) => /network request failed|failed to fetch|fetch failed|timeout/i.test(m);

/** Convierte un error de supabase-js en ErrorRed (se detiene la pasada) o Error (backoff). */
function lanzar(error: { message: string } | null) {
  if (!error) return;
  if (esErrorDeRed(error.message)) throw new ErrorRed(error.message);
  throw new Error(error.message);
}

/** EWKT para la columna geometry(LineString); se requieren al menos 2 puntos. */
function lineString(trazo: LatLng[]): string | null {
  if (trazo.length < 2) return null;
  return `SRID=4326;LINESTRING(${trazo.map((p) => `${p.lng} ${p.lat}`).join(',')})`;
}

export const apiSupabase: SyncApi = {
  async usuarioId() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  },

  async subirRecorrido(r, operadorId) {
    const { error } = await supabase!.from('recorridos').upsert({
      id: r.id,
      operador_id: operadorId,
      inicio: new Date(r.inicio).toISOString(),
      fin: r.fin ? new Date(r.fin).toISOString() : null,
      trazo: lineString(r.trazo),
      distancia_m: r.distanciaM,
      app_version: Constants.expoConfig?.version ?? null,
    });
    lanzar(error);
  },

  async registrarDeteccion(d) {
    const { error } = await supabase!.rpc('registrar_deteccion', {
      p_id: d.id,
      p_recorrido_id: d.recorridoId,
      p_origen: d.origen,
      p_clase: d.clase,
      p_confianza: d.confianza,
      p_bbox: [d.bbox.x, d.bbox.y, d.bbox.w, d.bbox.h],
      p_lat: d.lat,
      p_lng: d.lng,
      p_precision_m: d.precisionM,
      p_rumbo: d.rumbo,
      p_velocidad: d.velocidadMs,
      p_severidad: d.severidad,
      p_verificado: true,
      p_modelo_version: d.modeloVersion,
      p_evidencia_path: null,
      p_capturada_en: d.capturadaEn,
    });
    lanzar(error);
  },
};
