import type { Severidad } from './types';

const PESO_SEVERIDAD: Record<Severidad, number> = { baja: 0.33, media: 0.66, alta: 1 };

export interface PriorityInput {
  severidad: Severidad;
  frecuencia: number;
  diasAbierta: number;
}

/** Prioridad 0–100 (§3.6). Debe coincidir con la función SQL `calcular_prioridad`. */
export function computePriority({ severidad, frecuencia, diasAbierta }: PriorityInput): number {
  const f = Math.min(1, Math.log10(1 + frecuencia) / Math.log10(11));
  const d = Math.min(1, diasAbierta / 30);
  return 50 * PESO_SEVERIDAD[severidad] + 30 * f + 20 * d;
}
