import type { Severidad } from './types';

export type Penalizaciones = Record<Severidad, number>;

/** Segundos extra por incidencia sobre la ruta (RF-101, configurable). */
export const DEFAULT_PENALIZACIONES: Penalizaciones = { alta: 120, media: 45, baja: 0 };

export interface RutaEvaluada {
  duracionS: number;
  incidencias: Record<Severidad, number>;
}

export function routeCost(r: RutaEvaluada, p = DEFAULT_PENALIZACIONES): number {
  return r.duracionS + r.incidencias.alta * p.alta + r.incidencias.media * p.media + r.incidencias.baja * p.baja;
}

/** Índice de la ruta de menor costo, o -1 si no hay rutas. */
export function pickSafestRoute(rutas: RutaEvaluada[], p = DEFAULT_PENALIZACIONES): number {
  let mejor = -1;
  let costoMin = Infinity;
  rutas.forEach((r, i) => {
    const c = routeCost(r, p);
    if (c < costoMin) {
      costoMin = c;
      mejor = i;
    }
  });
  return mejor;
}
