import type { LatLng } from './types';

const R = 6_371_008.8; // radio medio de la Tierra (m)
const rad = (d: number) => (d * Math.PI) / 180;

/** Distancia haversine en metros. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rumbo inicial de a hacia b, 0–360° (0 = norte). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const φ1 = rad(a.lat);
  const φ2 = rad(b.lat);
  const Δλ = rad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** ¿El objetivo está dentro de ±toleranciaDeg del rumbo de avance? (RF-80) */
export function isAhead(pos: LatLng, rumboDeg: number, objetivo: LatLng, toleranciaDeg = 45): boolean {
  const diff = Math.abs(((bearingDeg(pos, objetivo) - rumboDeg + 540) % 360) - 180);
  return diff <= toleranciaDeg;
}
