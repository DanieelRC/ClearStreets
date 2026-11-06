import { distanceM } from './geo';
import type { Clase, LatLng } from './types';

export interface GateConfig {
  confianzaMin: Record<Clase, number>;
  fotogramasMin: number;
  intervaloMinMs: number;
  distanciaMinM: number;
  precisionMaxM: number;
}

export const DEFAULT_GATE_CONFIG: GateConfig = {
  confianzaMin: { bache: 0.5, basura: 0.5 },
  fotogramasMin: 2,
  intervaloMinMs: 2000,
  distanciaMinM: 10,
  precisionMaxM: 20,
};

export interface GateInput {
  clase: Clase;
  confianza: number;
  timestampMs: number;
  pos: LatLng;
  precisionM: number;
}

/**
 * Decide si una detección del modelo se registra (RF-13, RF-14, RF-16):
 * confianza mínima, persistencia en N fotogramas consecutivos y
 * como máximo una detección por clase cada 2 s y 10 m.
 */
export function createDetectionGate(cfg: GateConfig = DEFAULT_GATE_CONFIG) {
  const racha: Partial<Record<Clase, number>> = {};
  const ultima: Partial<Record<Clase, { t: number; pos: LatLng }>> = {};

  return {
    /** Llamar cuando el modelo detecta la clase en un fotograma. Devuelve true si se debe registrar. */
    push(d: GateInput): boolean {
      if (d.confianza < cfg.confianzaMin[d.clase] || d.precisionM > cfg.precisionMaxM) {
        racha[d.clase] = 0;
        return false;
      }
      const n = (racha[d.clase] ?? 0) + 1;
      racha[d.clase] = n;
      if (n < cfg.fotogramasMin) return false;

      const prev = ultima[d.clase];
      if (
        prev &&
        (d.timestampMs - prev.t < cfg.intervaloMinMs || distanceM(prev.pos, d.pos) < cfg.distanciaMinM)
      ) {
        return false;
      }
      ultima[d.clase] = { t: d.timestampMs, pos: d.pos };
      return true;
    },
    /** Llamar cuando un fotograma no contiene la clase. */
    miss(clase: Clase) {
      racha[clase] = 0;
    },
  };
}

export type DetectionGate = ReturnType<typeof createDetectionGate>;
