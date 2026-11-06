import { pickSafestRoute, routeCost } from '../routeScore';

describe('routeCost', () => {
  it('suma penalizaciones por severidad (RF-101)', () => {
    expect(routeCost({ duracionS: 600, incidencias: { alta: 1, media: 2, baja: 5 } })).toBe(600 + 120 + 90);
  });
});

describe('pickSafestRoute', () => {
  it('prefiere una ruta un poco más larga sin baches altos', () => {
    const rapida = { duracionS: 600, incidencias: { alta: 2, media: 0, baja: 0 } };
    const segura = { duracionS: 700, incidencias: { alta: 0, media: 1, baja: 0 } };
    expect(pickSafestRoute([rapida, segura])).toBe(1);
  });

  it('devuelve -1 sin rutas', () => {
    expect(pickSafestRoute([])).toBe(-1);
  });
});
