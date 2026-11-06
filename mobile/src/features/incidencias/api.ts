import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { Clase, Estado, LatLng, Severidad } from '@/domain/types';
import { supabase } from '@/lib/supabase';

import type { Incidencia } from './logica';

export const RADIO_CONSULTA_M = 5000;

function cliente() {
  if (!supabase) throw new Error('Backend no configurado (.env.local).');
  return supabase;
}

/** Redondea a ~1 km para no repetir la consulta con cada pequeño desplazamiento del mapa. */
const celda = (p: LatLng) => [Math.round(p.lat * 100) / 100, Math.round(p.lng * 100) / 100] as const;

/** Incidencias en un radio de 5 km (RF-60, RF-82). */
export function useIncidenciasCercanas(centro: LatLng | null) {
  const c = centro ? celda(centro) : null;
  return useQuery({
    queryKey: ['incidencias', c?.[0], c?.[1]],
    enabled: c !== null,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Incidencia[]> => {
      const { data, error } = await cliente().rpc('incidencias_cercanas', {
        p_lat: c![0],
        p_lng: c![1],
        p_radio_m: RADIO_CONSULTA_M,
      });
      if (error) throw new Error(error.message);
      return data as Incidencia[];
    },
  });
}

export interface CambioEstado {
  estado_anterior: Estado | null;
  estado_nuevo: Estado;
  nota: string | null;
  fecha: string;
}

export interface DetalleIncidencia {
  id: number;
  clase: Clase;
  severidad: Severidad;
  estado: Estado;
  frecuencia: number;
  prioridad: number;
  primera_deteccion: string;
  ultima_deteccion: string;
  resuelta_en: string | null;
  alcaldia: { nombre: string } | null;
  historial: CambioEstado[];
}

/** Detalle de una incidencia con su historial de estados (RF-62). */
export function useIncidencia(id: number) {
  return useQuery({
    queryKey: ['incidencia', id],
    enabled: Number.isFinite(id),
    queryFn: async (): Promise<DetalleIncidencia> => {
      const { data, error } = await cliente()
        .from('incidencias')
        .select(
          `id, clase, severidad, estado, frecuencia, prioridad, primera_deteccion, ultima_deteccion, resuelta_en,
           alcaldia:alcaldias(nombre),
           historial:historial_estado(estado_anterior, estado_nuevo, nota, fecha)`,
        )
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      const d = data as unknown as DetalleIncidencia;
      return { ...d, historial: [...d.historial].sort((a, b) => b.fecha.localeCompare(a.fecha)) };
    },
  });
}
