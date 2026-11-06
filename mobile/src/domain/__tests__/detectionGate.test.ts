import { createDetectionGate, type GateInput } from '../detectionGate';

const base: GateInput = {
  clase: 'bache',
  confianza: 0.8,
  timestampMs: 0,
  pos: { lat: 19.4326, lng: -99.1332 },
  precisionM: 5,
};

// Avanza ~11 m al norte por cada paso.
const step = (i: number, extra: Partial<GateInput> = {}): GateInput => ({
  ...base,
  timestampMs: i * 3000,
  pos: { lat: 19.4326 + i * 0.0001, lng: -99.1332 },
  ...extra,
});

describe('detectionGate', () => {
  it('requiere 2 fotogramas consecutivos (RF-13)', () => {
    const gate = createDetectionGate();
    expect(gate.push(step(0))).toBe(false);
    expect(gate.push(step(0, { timestampMs: 100 }))).toBe(true);
  });

  it('descarta confianza menor al umbral', () => {
    const gate = createDetectionGate();
    gate.push(step(0, { confianza: 0.4 }));
    expect(gate.push(step(0, { confianza: 0.4, timestampMs: 100 }))).toBe(false);
  });

  it('un fotograma sin detección reinicia la racha', () => {
    const gate = createDetectionGate();
    gate.push(step(0));
    gate.miss('bache');
    expect(gate.push(step(0, { timestampMs: 200 }))).toBe(false);
  });

  it('limita a una detección cada 2 s y 10 m por clase (RF-14)', () => {
    const gate = createDetectionGate();
    gate.push(step(0));
    expect(gate.push(step(0, { timestampMs: 100 }))).toBe(true);
    // 1 s después, mismo lugar → bloqueada
    expect(gate.push(step(0, { timestampMs: 1000 }))).toBe(false);
    // 3 s después y ~11 m → permitida
    expect(gate.push(step(1))).toBe(true);
  });

  it('las clases son independientes', () => {
    const gate = createDetectionGate();
    gate.push(step(0));
    expect(gate.push(step(0, { timestampMs: 100 }))).toBe(true);
    gate.push(step(0, { clase: 'basura', timestampMs: 150 }));
    expect(gate.push(step(0, { clase: 'basura', timestampMs: 200 }))).toBe(true);
  });

  it('descarta precisión GPS > 20 m (RF-16)', () => {
    const gate = createDetectionGate();
    gate.push(step(0, { precisionM: 30 }));
    expect(gate.push(step(0, { precisionM: 30, timestampMs: 100 }))).toBe(false);
  });
});
