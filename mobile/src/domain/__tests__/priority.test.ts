import { computePriority } from '../priority';

describe('computePriority', () => {
  it('incidencia nueva, baja, vista una vez', () => {
    // 50*0.33 + 30*log10(2)/log10(11) + 0
    expect(computePriority({ severidad: 'baja', frecuencia: 1, diasAbierta: 0 })).toBeCloseTo(25.17, 2);
  });

  it('alta, frecuencia 10 y 30 días llega a 100', () => {
    expect(computePriority({ severidad: 'alta', frecuencia: 10, diasAbierta: 30 })).toBeCloseTo(100);
  });

  it('satura frecuencia y antigüedad', () => {
    expect(computePriority({ severidad: 'alta', frecuencia: 500, diasAbierta: 400 })).toBeCloseTo(100);
  });

  it('ordena alta por encima de media con mismos datos', () => {
    const a = computePriority({ severidad: 'alta', frecuencia: 2, diasAbierta: 3 });
    const m = computePriority({ severidad: 'media', frecuencia: 2, diasAbierta: 3 });
    expect(a).toBeGreaterThan(m);
  });
});
