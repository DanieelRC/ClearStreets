export type Clase = 'bache' | 'basura';
export type Severidad = 'baja' | 'media' | 'alta';
export type Estado = 'pendiente' | 'en_proceso' | 'resuelto';
export type Origen = 'auto' | 'manual' | 'ciudadano';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Caja normalizada 0..1: (x, y) es el centro, w/h el tamaño relativo al fotograma. */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SEVERIDADES: readonly Severidad[] = ['baja', 'media', 'alta'];
