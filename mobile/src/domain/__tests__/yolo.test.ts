import { decodeYolo, iou, nms, unletterbox, type Deteccion } from '../yolo';

/** Construye una salida YOLOv8 [1, 4+nc, N] (canales primero) a partir de cajas. */
function salidaCanalesPrimero(cajas: { x: number; y: number; w: number; h: number; scores: number[] }[]) {
  const n = cajas.length;
  const nc = cajas[0].scores.length;
  const out = new Float32Array((4 + nc) * n);
  cajas.forEach((c, i) => {
    out[0 * n + i] = c.x;
    out[1 * n + i] = c.y;
    out[2 * n + i] = c.w;
    out[3 * n + i] = c.h;
    c.scores.forEach((s, k) => (out[(4 + k) * n + i] = s));
  });
  return out;
}

describe('iou', () => {
  it('1 para cajas iguales y 0 para disjuntas', () => {
    const a = { x: 0.5, y: 0.5, w: 0.2, h: 0.2 };
    expect(iou(a, a)).toBeCloseTo(1);
    expect(iou(a, { x: 0.9, y: 0.9, w: 0.1, h: 0.1 })).toBe(0);
  });
});

describe('nms', () => {
  it('suprime cajas solapadas de la misma clase y conserva otras clases', () => {
    const d: Deteccion[] = [
      { clase: 0, score: 0.9, box: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 } },
      { clase: 0, score: 0.8, box: { x: 0.51, y: 0.5, w: 0.2, h: 0.2 } },
      { clase: 1, score: 0.7, box: { x: 0.51, y: 0.5, w: 0.2, h: 0.2 } },
    ];
    const r = nms(d, 0.5);
    expect(r.map((x) => x.score)).toEqual([0.9, 0.7]);
  });
});

describe('decodeYolo', () => {
  const cajas = [
    { x: 0.5, y: 0.6, w: 0.2, h: 0.1, scores: [0.9, 0.1] },
    { x: 0.505, y: 0.6, w: 0.2, h: 0.1, scores: [0.85, 0.1] }, // duplicada
    { x: 0.2, y: 0.8, w: 0.1, h: 0.1, scores: [0.1, 0.7] },
    { x: 0.8, y: 0.2, w: 0.1, h: 0.1, scores: [0.2, 0.3] }, // bajo umbral
  ];

  it('decodifica formato [1, 4+nc, N]', () => {
    const r = decodeYolo(salidaCanalesPrimero(cajas), [1, 6, 4], { numClases: 2, umbral: 0.5 });
    expect(r).toHaveLength(2);
    expect(r[0].clase).toBe(0);
    expect(r[0].score).toBeCloseTo(0.9);
    expect(r[1]).toMatchObject({ clase: 1 });
    expect(r[1].score).toBeCloseTo(0.7);
  });

  it('decodifica formato [1, N, 4+nc]', () => {
    const fila = new Float32Array(cajas.flatMap((c) => [c.x, c.y, c.w, c.h, ...c.scores]));
    const r = decodeYolo(fila, [1, 4, 6], { numClases: 2, umbral: 0.5 });
    expect(r).toHaveLength(2);
  });

  it('escala coordenadas en píxeles si se indica el tamaño de entrada', () => {
    const px = salidaCanalesPrimero([{ x: 320, y: 320, w: 64, h: 64, scores: [0.9] }]);
    const r = decodeYolo(px, [1, 5, 1], { numClases: 1, umbral: 0.5, tamanoEntrada: 640 });
    expect(r[0].box).toEqual({ x: 0.5, y: 0.5, w: 0.1, h: 0.1 });
  });
});

describe('unletterbox', () => {
  it('quita las franjas de un fotograma vertical 9:16 ajustado a 640x640', () => {
    // Imagen 720x1280 → escala 0.5 → 360x640, franjas horizontales de 140 px.
    const box = { x: 0.5, y: 0.5, w: 360 / 640, h: 1 };
    const r = unletterbox(box, 720, 1280);
    expect(r.x).toBeCloseTo(0.5);
    expect(r.w).toBeCloseTo(1);
    expect(r.h).toBeCloseTo(1);
  });

  it('mueve un punto del borde de la franja al borde de la imagen', () => {
    const r = unletterbox({ x: 140 / 640, y: 0.5, w: 0, h: 0 }, 720, 1280);
    expect(r.x).toBeCloseTo(0);
  });
});
