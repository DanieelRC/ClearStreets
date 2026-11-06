import { distanceM } from '@/domain/geo';
import type { Clase, Estado, LatLng, Severidad } from '@/domain/types';

/** Fila de `incidencias_cercanas` (supabase/migrations). */
export interface Incidencia {
  id: number;
  clase: Clase;
  severidad: Severidad;
  estado: Estado;
  lat: number;
  lng: number;
  frecuencia: number;
  prioridad: number;
  alcaldia: string | null;
}

export interface Filtros {
  clases: Clase[];
  severidades: Severidad[];
  estados: Estado[];
  alcaldia: string | null;
}

export const FILTROS_INICIALES: Filtros = {
  clases: ['bache', 'basura'],
  severidades: ['baja', 'media', 'alta'],
  estados: ['pendiente', 'en_proceso'],
  alcaldia: null,
};

export function filtrar(incs: Incidencia[], f: Filtros): Incidencia[] {
  return incs.filter(
    (i) =>
      f.clases.includes(i.clase) &&
      f.severidades.includes(i.severidad) &&
      f.estados.includes(i.estado) &&
      (f.alcaldia === null || i.alcaldia === f.alcaldia),
  );
}

export type Orden = 'distancia' | 'prioridad';

export type IncidenciaOrdenada = Incidencia & { distanciaM?: number };

export function ordenar(incs: Incidencia[], orden: Orden, pos: LatLng | null): IncidenciaOrdenada[] {
  const conDistancia = incs.map((i): IncidenciaOrdenada => (pos ? { ...i, distanciaM: distanceM(pos, i) } : { ...i }));
  if (orden === 'distancia' && pos) return conDistancia.sort((a, b) => a.distanciaM! - b.distanciaM!);
  return conDistancia.sort((a, b) => b.prioridad - a.prioridad);
}

/** FeatureCollection para ShapeSource. `alta` permite contar altas dentro de cada cluster. */
export function aGeoJSON(incs: Incidencia[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: incs.map((i) => ({
      type: 'Feature',
      id: i.id,
      geometry: { type: 'Point', coordinates: [i.lng, i.lat] },
      properties: { id: i.id, clase: i.clase, severidad: i.severidad, estado: i.estado, alta: i.severidad === 'alta' ? 1 : 0 },
    })),
  };
}

export function alcaldiasDe(incs: Incidencia[]): string[] {
  return [...new Set(incs.map((i) => i.alcaldia).filter((a): a is string => a !== null))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  );
}

export const ETIQUETA = {
  clase: { bache: 'Bache', basura: 'Basura' },
  severidad: { baja: 'Baja', media: 'Media', alta: 'Alta' },
  estado: { pendiente: 'Pendiente', en_proceso: 'En proceso', resuelto: 'Resuelto' },
} as const;

export const COLOR_SEVERIDAD: Record<Severidad, string> = { baja: '#EAB308', media: '#F97316', alta: '#DC2626' };
