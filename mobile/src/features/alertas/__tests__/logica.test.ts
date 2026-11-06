import { evaluarAlerta, filtrarParaCache, necesitaRecarga, podarHistorial, type PuntoAlerta } from '../logica';

const AHORA = 10_000_000;
const aqui = { lat: 19.4326, lng: -99.1332 };
// ~0.0009° de latitud ≈ 100 m al norte.
const p = (id: number, dLat: number, extra: Partial<PuntoAlerta> = {}): PuntoAlerta => ({
  id,
  lat: aqui.lat + dLat,
  lng: aqui.lng,
  clase: 'bache',
  severidad: 'alta',
  estado: 'pendiente',
  ...extra,
});
const mov = { pos: aqui, rumbo: 0, velocidadMs: 10 };

describe('evaluarAlerta (RF-80, RF-83)', () => {
  it('avisa de un bache alto a ~100 m adelante', () => {
    const r = evaluarAlerta(mov, [p(1, 0.0009)], {}, AHORA);
    expect(r?.punto.id).toBe(1);
    expect(r?.distanciaM).toBeCloseTo(100, -1);
  });

  it('ignora lo que está a más de 150 m', () => {
    expect(evaluarAlerta(mov, [p(1, 0.0015)], {}, AHORA)).toBeNull();
  });

  it('ignora lo que está detrás', () => {
    expect(evaluarAlerta({ ...mov, rumbo: 180 }, [p(1, 0.0009)], {}, AHORA)).toBeNull();
  });

  it('solo baches altos no resueltos', () => {
    const r = evaluarAlerta(
      mov,
      [p(1, 0.0005, { severidad: 'media' }), p(2, 0.0005, { clase: 'basura' }), p(3, 0.0005, { estado: 'resuelto' })],
      {},
      AHORA,
    );
    expect(r).toBeNull();
  });

  it('elige el más cercano', () => {
    expect(evaluarAlerta(mov, [p(1, 0.0012), p(2, 0.0004)], {}, AHORA)?.punto.id).toBe(2);
  });

  it('no repite la misma alerta en 10 min', () => {
    expect(evaluarAlerta(mov, [p(1, 0.0009)], { 1: AHORA - 5 * 60_000 }, AHORA)).toBeNull();
    expect(evaluarAlerta(mov, [p(1, 0.0009)], { 1: AHORA - 11 * 60_000 }, AHORA)?.punto.id).toBe(1);
  });

  it('salta a la siguiente si la más cercana ya se avisó', () => {
    expect(evaluarAlerta(mov, [p(1, 0.0004), p(2, 0.0009)], { 1: AHORA }, AHORA)?.punto.id).toBe(2);
  });

  it('no avisa detenido o sin rumbo (el rumbo del GPS no es confiable)', () => {
    expect(evaluarAlerta({ ...mov, velocidadMs: 0.5 }, [p(1, 0.0009)], {}, AHORA)).toBeNull();
    expect(evaluarAlerta({ ...mov, rumbo: -1 }, [p(1, 0.0009)], {}, AHORA)).toBeNull();
  });
});

describe('necesitaRecarga (RF-82)', () => {
  it('sin caché', () => expect(necesitaRecarga(null, aqui, AHORA)).toBe(true));
  it('caché reciente y cerca', () => {
    expect(necesitaRecarga({ centro: aqui, fecha: AHORA - 60_000 }, { lat: aqui.lat + 0.01, lng: aqui.lng }, AHORA)).toBe(false);
  });
  it('se aleja más de 2.5 km', () => {
    expect(necesitaRecarga({ centro: aqui, fecha: AHORA }, { lat: aqui.lat + 0.03, lng: aqui.lng }, AHORA)).toBe(true);
  });
  it('caché de más de 10 min', () => {
    expect(necesitaRecarga({ centro: aqui, fecha: AHORA - 11 * 60_000 }, aqui, AHORA)).toBe(true);
  });
});

describe('podarHistorial', () => {
  it('quita entradas viejas', () => {
    expect(podarHistorial({ 1: AHORA - 11 * 60_000, 2: AHORA - 60_000 }, AHORA)).toEqual({ 2: AHORA - 60_000 });
  });
});

describe('filtrarParaCache', () => {
  it('guarda solo baches altos no resueltos', () => {
    const r = filtrarParaCache([p(1, 0), p(2, 0, { severidad: 'baja' }), p(3, 0, { estado: 'resuelto' })]);
    expect(r.map((x) => x.id)).toEqual([1]);
  });
});
