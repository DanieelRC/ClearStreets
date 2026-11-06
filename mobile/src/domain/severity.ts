import { SEVERIDADES, type BBox, type Clase, type Severidad } from './types';

/** Umbrales [media, alta] de área ajustada por clase y factor de perspectiva k (§3.6). */
export interface SeverityConfig {
  bache: [number, number];
  basura: [number, number];
  k: number;
}

export const DEFAULT_SEVERITY_CONFIG: SeverityConfig = {
  bache: [0.02, 0.06],
  basura: [0.03, 0.1],
  k: 1,
};

/** a' = a · (1 + k·(1 − y_centro)): los objetos arriba del fotograma están más lejos. */
export function adjustedArea(box: BBox, k = DEFAULT_SEVERITY_CONFIG.k): number {
  return box.w * box.h * (1 + k * (1 - box.y));
}

export interface SeverityInput {
  clase: Clase;
  box: BBox;
  confianza: number;
  frecuencia: number;
}

export function computeSeverity(input: SeverityInput, cfg = DEFAULT_SEVERITY_CONFIG): Severidad {
  const a = adjustedArea(input.box, cfg.k);
  const [media, alta] = cfg[input.clase];
  let nivel = a >= alta ? 2 : a >= media ? 1 : 0;
  if (input.confianza >= 0.85 && input.frecuencia >= 3) nivel = Math.min(2, nivel + 1);
  return SEVERIDADES[nivel];
}
