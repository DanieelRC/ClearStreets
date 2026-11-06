import { adjustedArea, computeSeverity } from '../severity';

const box = (w: number, h: number, yCenter = 1) => ({ x: 0.5, y: yCenter, w, h });

describe('adjustedArea', () => {
  it('no corrige objetos en la parte inferior del fotograma', () => {
    expect(adjustedArea(box(0.2, 0.1, 1))).toBeCloseTo(0.02);
  });

  it('aumenta el área de objetos lejanos (parte superior)', () => {
    expect(adjustedArea(box(0.2, 0.1, 0))).toBeCloseTo(0.04);
  });
});

describe('computeSeverity', () => {
  it.each([
    ['bache', 0.01, 'baja'],
    ['bache', 0.03, 'media'],
    ['bache', 0.06, 'alta'],
    ['basura', 0.02, 'baja'],
    ['basura', 0.05, 'media'],
    ['basura', 0.1, 'alta'],
  ] as const)('%s con área %d es %s', (clase, area, esperado) => {
    expect(computeSeverity({ clase, box: box(area, 1), confianza: 0.6, frecuencia: 1 })).toBe(esperado);
  });

  it('sube un nivel con confianza alta y frecuencia >= 3', () => {
    expect(computeSeverity({ clase: 'bache', box: box(0.01, 1), confianza: 0.9, frecuencia: 3 })).toBe('media');
  });

  it('no supera alta', () => {
    expect(computeSeverity({ clase: 'bache', box: box(0.5, 1), confianza: 0.9, frecuencia: 5 })).toBe('alta');
  });

  it('respeta umbrales configurables', () => {
    expect(
      computeSeverity(
        { clase: 'bache', box: box(0.01, 1), confianza: 0.6, frecuencia: 1 },
        { bache: [0.005, 0.008], basura: [0.03, 0.1], k: 1 },
      ),
    ).toBe('alta');
  });
});
