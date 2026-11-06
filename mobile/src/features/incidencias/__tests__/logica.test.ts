import { aGeoJSON, alcaldiasDe, FILTROS_INICIALES, filtrar, ordenar, type Incidencia } from '../logica';

const inc = (id: number, extra: Partial<Incidencia> = {}): Incidencia => ({
  id,
  clase: 'bache',
  severidad: 'media',
  estado: 'pendiente',
  lat: 19.4326,
  lng: -99.1332,
  frecuencia: 1,
  prioridad: 50,
  alcaldia: 'Cuauhtémoc',
  ...extra,
});

describe('filtrar (RF-61)', () => {
  const datos = [
    inc(1),
    inc(2, { clase: 'basura' }),
    inc(3, { severidad: 'alta' }),
    inc(4, { estado: 'resuelto' }),
    inc(5, { alcaldia: 'Iztapalapa' }),
    inc(6, { alcaldia: null }),
  ];

  it('por defecto oculta las resueltas', () => {
    expect(filtrar(datos, FILTROS_INICIALES).map((i) => i.id)).toEqual([1, 2, 3, 5, 6]);
  });

  it('filtra por clase, severidad y alcaldía', () => {
    const f = { ...FILTROS_INICIALES, clases: ['bache' as const], severidades: ['alta' as const] };
    expect(filtrar(datos, f).map((i) => i.id)).toEqual([3]);
    expect(filtrar(datos, { ...FILTROS_INICIALES, alcaldia: 'Iztapalapa' }).map((i) => i.id)).toEqual([5]);
  });
});

describe('ordenar (RF-63)', () => {
  const aqui = { lat: 19.4326, lng: -99.1332 };
  const datos = [
    inc(1, { lat: 19.4426, prioridad: 90 }), // ~1.1 km
    inc(2, { lat: 19.4336, prioridad: 10 }), // ~110 m
    inc(3, { lat: 19.4526, prioridad: 50 }), // ~2.2 km
  ];

  it('por distancia y añade distanciaM', () => {
    const r = ordenar(datos, 'distancia', aqui);
    expect(r.map((i) => i.id)).toEqual([2, 1, 3]);
    expect(r[0].distanciaM).toBeCloseTo(111, 0);
  });

  it('por prioridad descendente', () => {
    expect(ordenar(datos, 'prioridad', aqui).map((i) => i.id)).toEqual([1, 3, 2]);
  });

  it('sin ubicación, distancia cae a prioridad', () => {
    const r = ordenar(datos, 'distancia', null);
    expect(r.map((i) => i.id)).toEqual([1, 3, 2]);
    expect(r[0].distanciaM).toBeUndefined();
  });

  it('no muta la entrada', () => {
    const copia = [...datos];
    ordenar(datos, 'prioridad', aqui);
    expect(datos).toEqual(copia);
  });
});

describe('aGeoJSON (RF-60)', () => {
  it('genera puntos [lng, lat] con propiedades para estilos', () => {
    const fc = aGeoJSON([inc(7, { severidad: 'alta', clase: 'basura' })]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features[0]).toEqual({
      type: 'Feature',
      id: 7,
      geometry: { type: 'Point', coordinates: [-99.1332, 19.4326] },
      properties: { id: 7, clase: 'basura', severidad: 'alta', estado: 'pendiente', alta: 1 },
    });
  });
});

describe('alcaldiasDe', () => {
  it('lista única y ordenada, sin nulos', () => {
    expect(alcaldiasDe([inc(1, { alcaldia: 'Tlalpan' }), inc(2), inc(3, { alcaldia: null }), inc(4)])).toEqual([
      'Cuauhtémoc',
      'Tlalpan',
    ]);
  });
});
