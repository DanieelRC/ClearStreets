import { useCallback, useMemo, useState } from 'react';
import { useFrameOutput } from 'react-native-vision-camera';
import { useResizer } from 'react-native-vision-camera-resizer';
import { scheduleOnRN } from 'react-native-worklets';

import type { BBox, Clase } from '@/domain/types';
import { decodeYolo, unletterbox } from '@/domain/yolo';

import { ENTRADA } from './modelos';
import { useModelos } from './useModelos';

export interface DeteccionFotograma {
  clase: Clase;
  confianza: number;
  box: BBox; // normalizada respecto al fotograma vertical
  modeloVersion: string;
}

const UMBRAL_DECODIFICACION = 0.25; // el filtro fino lo hace detectionGate

/**
 * Ejecuta los modelos sobre cada fotograma de la cámara (en el hilo del frame output)
 * y entrega las detecciones al hilo de JS mediante `onDetecciones`.
 */
export function useDetector(onDetecciones: (d: DeteccionFotograma[], t: number) => void) {
  const modelos = useModelos();
  const resizer = useResizer({
    width: ENTRADA.lado,
    height: ENTRADA.lado,
    channelOrder: 'rgb',
    dataType: ENTRADA.dataType,
    scaleMode: 'contain',
    pixelLayout: 'interleaved',
  });
  const [msPorFotograma, setMsPorFotograma] = useState(0);

  const entregar = useCallback(
    (d: DeteccionFotograma[], t: number, ms: number) => {
      setMsPorFotograma((prev) => (prev === 0 ? ms : prev * 0.9 + ms * 0.1));
      onDetecciones(d, t);
    },
    [onDetecciones],
  );

  const listos = useMemo(
    () =>
      modelos.modelos.map((m) => ({
        model: m.model,
        clases: m.config.clases,
        version: m.config.version,
        shape: m.model.outputs[0].shape,
      })),
    [modelos.modelos],
  );
  const r = resizer.resizer;

  const frameOutput = useFrameOutput({
    pixelFormat: 'native',
    enablePhysicalBufferRotation: true,
    dropFramesWhileBusy: true,
    onFrame(frame) {
      'worklet';
      try {
        if (r == null || listos.length === 0) return;
        const inicio = performance.now();
        const ancho = frame.width;
        const alto = frame.height;
        const t = Date.now();

        const resized = r.resize(frame);
        const entrada = resized.getPixelBuffer();
        const resultado: DeteccionFotograma[] = [];

        for (const m of listos) {
          const salida = m.model.runSync([entrada]);
          const dets = decodeYolo(new Float32Array(salida[0]), m.shape, {
            numClases: m.clases.length,
            umbral: UMBRAL_DECODIFICACION,
            tamanoEntrada: ENTRADA.coordenadasEnPixeles ? ENTRADA.lado : undefined,
          });
          for (const d of dets) {
            const clase = m.clases[d.clase];
            if (clase == null) continue;
            resultado.push({
              clase,
              confianza: d.score,
              box: unletterbox(d.box, ancho, alto),
              modeloVersion: m.version,
            });
          }
        }
        resized.dispose();
        scheduleOnRN(entregar, resultado, t, performance.now() - inicio);
      } finally {
        frame.dispose();
      }
    },
  });

  return {
    frameOutput,
    msPorFotograma,
    estadoModelos: modelos,
    errorResizer: resizer.state === 'error' ? resizer.error.message : undefined,
    activo: r != null && listos.length > 0,
  };
}
