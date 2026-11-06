/**
 * Decodificación de salidas de detectores YOLO (v8/v11) exportados a TFLite.
 * Todas las funciones son worklets: se ejecutan en el hilo del frame output.
 */
import type { BBox } from './types';

export interface Deteccion {
  clase: number;
  score: number;
  box: BBox; // normalizada 0..1, centro + tamaño
}

export interface DecodeOptions {
  numClases: number;
  umbral: number;
  iouNms?: number;
  /** Si las coordenadas vienen en píxeles de entrada (p. ej. 640), se normalizan. */
  tamanoEntrada?: number;
  maxDetecciones?: number;
}

export function iou(a: BBox, b: BBox): number {
  'worklet';
  const x1 = Math.max(a.x - a.w / 2, b.x - b.w / 2);
  const y1 = Math.max(a.y - a.h / 2, b.y - b.h / 2);
  const x2 = Math.min(a.x + a.w / 2, b.x + b.w / 2);
  const y2 = Math.min(a.y + a.h / 2, b.y + b.h / 2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/** Non-maximum suppression por clase. */
export function nms(dets: Deteccion[], umbralIou: number): Deteccion[] {
  'worklet';
  const ordenadas = dets.slice().sort((a, b) => b.score - a.score);
  const result: Deteccion[] = [];
  for (const d of ordenadas) {
    let suprimida = false;
    for (const k of result) {
      if (k.clase === d.clase && iou(k.box, d.box) > umbralIou) {
        suprimida = true;
        break;
      }
    }
    if (!suprimida) result.push(d);
  }
  return result;
}

/**
 * Acepta salidas [1, 4+nc, N] (export por defecto de Ultralytics) o [1, N, 4+nc].
 * Cada caja: cx, cy, w, h seguido de los scores de cada clase.
 */
export function decodeYolo(out: Float32Array, shape: number[], opts: DecodeOptions): Deteccion[] {
  'worklet';
  const nc = opts.numClases;
  const atributos = 4 + nc;
  const canalesPrimero = shape[1] === atributos;
  const n = canalesPrimero ? shape[2] : shape[1];
  const esc = opts.tamanoEntrada ?? 1;
  const at = (i: number, k: number) => (canalesPrimero ? out[k * n + i] : out[i * atributos + k]);

  const candidatas: Deteccion[] = [];
  for (let i = 0; i < n; i++) {
    let mejor = -1;
    let score = opts.umbral;
    for (let c = 0; c < nc; c++) {
      const s = at(i, 4 + c);
      if (s >= score) {
        score = s;
        mejor = c;
      }
    }
    if (mejor < 0) continue;
    candidatas.push({
      clase: mejor,
      score,
      box: { x: at(i, 0) / esc, y: at(i, 1) / esc, w: at(i, 2) / esc, h: at(i, 3) / esc },
    });
  }
  return nms(candidatas, opts.iouNms ?? 0.45).slice(0, opts.maxDetecciones ?? 20);
}

/**
 * Convierte una caja normalizada sobre la entrada cuadrada con franjas (resize 'contain')
 * a coordenadas normalizadas de la imagen original anchoImg × altoImg.
 */
export function unletterbox(box: BBox, anchoImg: number, altoImg: number): BBox {
  'worklet';
  const lado = Math.max(anchoImg, altoImg);
  const sx = lado / anchoImg; // ≥ 1
  const sy = lado / altoImg;
  return {
    x: (box.x - 0.5) * sx + 0.5,
    y: (box.y - 0.5) * sy + 0.5,
    w: box.w * sx,
    h: box.h * sy,
  };
}
