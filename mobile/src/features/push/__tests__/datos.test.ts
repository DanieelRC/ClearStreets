import { incidenciaDeNotificacion } from '../datos';

describe('incidenciaDeNotificacion', () => {
  it('lee el id numérico', () => {
    expect(incidenciaDeNotificacion({ incidenciaId: 12 })).toBe(12);
  });
  it('acepta id como texto', () => {
    expect(incidenciaDeNotificacion({ incidenciaId: '7' })).toBe(7);
  });
  it.each([undefined, null, {}, { incidenciaId: 'abc' }, { incidenciaId: -1 }, { incidenciaId: 1.5 }])(
    'rechaza %p',
    (d) => {
      expect(incidenciaDeNotificacion(d)).toBeNull();
    },
  );
});
