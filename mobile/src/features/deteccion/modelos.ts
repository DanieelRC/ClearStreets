import type { ModelSource } from 'react-native-fast-tflite';

import type { Clase } from '@/domain/types';

export interface ModeloConfig {
  id: string;
  /** Se guarda en cada detección (`modelo_version`). */
  version: string;
  /** `require('@/assets/models/x.tflite')` o `{ url }`. null = aún no instalado. */
  fuente: ModelSource | null;
  /** Clase de ClearStreets por índice de salida del modelo; null = clase ignorada. */
  clases: (Clase | null)[];
}

/** Todos los modelos comparten la misma entrada (lado × lado, RGB). */
export const ENTRADA = {
  lado: 640,
  dataType: 'float32',
  /** true si el modelo devuelve cajas en píxeles de entrada en vez de 0..1. */
  coordenadasEnPixeles: false,
} as const;

/**
 * Modelos preentrenados usados tal cual (requerimientos §5.2).
 * Al agregar un .tflite en assets/models, reemplaza `fuente: null` por su `require`
 * y ajusta `clases` al orden de clases del modelo.
 */
export const MODELOS: ModeloConfig[] = [
  {
    id: 'baches',
    version: 'pendiente',
    fuente: null, // require('@/assets/models/baches.tflite')
    clases: ['bache'],
  },
  {
    id: 'basura',
    version: 'pendiente',
    fuente: null, // require('@/assets/models/basura.tflite')
    clases: ['basura'],
  },
];
