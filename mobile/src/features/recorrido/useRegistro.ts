import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useCallback, useRef, useState } from 'react';

import { createDetectionGate } from '@/domain/detectionGate';
import { computeSeverity } from '@/domain/severity';
import type { BBox, Clase, Origen } from '@/domain/types';
import type { DeteccionFotograma } from '@/features/deteccion/useDetector';

import { useRecorrido, type PuntoGps } from './store';

const CLASES: Clase[] = ['bache', 'basura'];
const CAJA_VACIA: BBox = { x: 0.5, y: 0.5, w: 0, h: 0 };

/**
 * Convierte las detecciones de cada fotograma en detecciones registradas:
 * filtro de persistencia/espaciado (RF-13/14), GPS (RF-15/16) y severidad (RF-18).
 */
export function useRegistro(detenido: () => boolean) {
  const [gate] = useState(createDetectionGate);
  const ultimoFotograma = useRef<DeteccionFotograma[]>([]);
  const registrar = useRecorrido((s) => s.registrar);

  const guardar = useCallback(
    (d: DeteccionFotograma | undefined, clase: Clase, origen: Origen, p: PuntoGps, t: number) => {
      const recorrido = useRecorrido.getState().recorrido;
      if (!recorrido) return;
      registrar({
        id: randomUUID(),
        recorridoId: recorrido.id,
        origen,
        clase,
        confianza: d?.confianza ?? 0,
        bbox: d?.box ?? CAJA_VACIA,
        lat: p.lat,
        lng: p.lng,
        precisionM: p.precisionM,
        rumbo: p.rumbo,
        velocidadMs: p.velocidadMs,
        severidad: computeSeverity({ clase, box: d?.box ?? CAJA_VACIA, confianza: d?.confianza ?? 0, frecuencia: 1 }),
        modeloVersion: d?.modeloVersion ?? 'manual',
        capturadaEn: new Date(t).toISOString(),
        descartada: false,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    [registrar],
  );

  /** Callback para useDetector: se llama por cada fotograma procesado. */
  const alProcesarFotograma = useCallback(
    (dets: DeteccionFotograma[], t: number) => {
      ultimoFotograma.current = dets;
      const p = useRecorrido.getState().ultimoPunto;
      for (const clase of CLASES) {
        const mejor = mejorDe(dets, clase);
        if (!mejor || !p) {
          gate.miss(clase);
          continue;
        }
        const pasa = gate.push({
          clase,
          confianza: mejor.confianza,
          timestampMs: t,
          pos: p,
          precisionM: p.precisionM,
        });
        if (pasa && !detenido()) guardar(mejor, clase, 'auto', p, t);
      }
    },
    [gate, guardar, detenido],
  );

  /** Registro manual de un toque (RF-17): usa la mejor detección del último fotograma. */
  const registrarManual = useCallback((): boolean => {
    const p = useRecorrido.getState().ultimoPunto;
    if (!p) return false;
    const dets = ultimoFotograma.current;
    const mejor = dets.slice().sort((a, b) => b.confianza - a.confianza)[0];
    guardar(mejor, mejor?.clase ?? 'bache', 'manual', p, Date.now());
    return true;
  }, [guardar]);

  return { alProcesarFotograma, registrarManual };
}

function mejorDe(dets: DeteccionFotograma[], clase: Clase): DeteccionFotograma | undefined {
  let mejor: DeteccionFotograma | undefined;
  for (const d of dets) if (d.clase === clase && (!mejor || d.confianza > mejor.confianza)) mejor = d;
  return mejor;
}
