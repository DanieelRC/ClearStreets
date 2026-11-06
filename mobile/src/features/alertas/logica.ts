import { distanceM, isAhead } from '@/domain/geo';
import type { Clase, Estado, LatLng, Severidad } from '@/domain/types';

export interface PuntoAlerta extends LatLng {
  id: number;
  clase: Clase;
  severidad: Severidad;
  estado: Estado;
}

export const CONFIG_ALERTAS = {
  /** RF-80 */
  radioM: 150,
  toleranciaDeg: 45,
  /** RF-83 */
  repetirMs: 10 * 60_000,
  /** Por debajo de ~7 km/h el rumbo del GPS no es confiable. */
  velocidadMinMs: 2,
  /** RF-82: se recarga al alejarse la mitad del radio de descarga o cada 10 min. */
  radioCacheM: 5000,
  recargaDistM: 2500,
  recargaMs: 10 * 60_000,
};

export type Historial = Record<number, number>;

export interface Movimiento {
  pos: LatLng;
  rumbo: number;
  velocidadMs: number;
}

const alertable = (p: PuntoAlerta) => p.clase === 'bache' && p.severidad === 'alta' && p.estado !== 'resuelto';

/** Lo que vale la pena guardar en la caché del modo conducción. */
export function filtrarParaCache(ps: PuntoAlerta[]): PuntoAlerta[] {
  return ps.filter(alertable);
}

/** Bache alto más cercano, adelante y a ≤ 150 m, no avisado en los últimos 10 min. */
export function evaluarAlerta(
  m: Movimiento,
  puntos: PuntoAlerta[],
  historial: Historial,
  ahora: number,
  cfg = CONFIG_ALERTAS,
): { punto: PuntoAlerta; distanciaM: number } | null {
  if (m.velocidadMs < cfg.velocidadMinMs || m.rumbo < 0) return null;
  let mejor: { punto: PuntoAlerta; distanciaM: number } | null = null;
  for (const punto of puntos) {
    if (!alertable(punto)) continue;
    const avisada = historial[punto.id];
    if (avisada !== undefined && ahora - avisada < cfg.repetirMs) continue;
    const d = distanceM(m.pos, punto);
    if (d > cfg.radioM || (mejor && d >= mejor.distanciaM)) continue;
    if (!isAhead(m.pos, m.rumbo, punto, cfg.toleranciaDeg)) continue;
    mejor = { punto, distanciaM: d };
  }
  return mejor;
}

export function necesitaRecarga(
  cache: { centro: LatLng; fecha: number } | null,
  pos: LatLng,
  ahora: number,
  cfg = CONFIG_ALERTAS,
): boolean {
  if (!cache) return true;
  return ahora - cache.fecha > cfg.recargaMs || distanceM(cache.centro, pos) > cfg.recargaDistM;
}

export function podarHistorial(h: Historial, ahora: number, cfg = CONFIG_ALERTAS): Historial {
  return Object.fromEntries(Object.entries(h).filter(([, t]) => ahora - t < cfg.repetirMs)) as Historial;
}
