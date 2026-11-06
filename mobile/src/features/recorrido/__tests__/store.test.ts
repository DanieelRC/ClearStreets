import { configurarPersistencia, resumir, useRecorrido, type DeteccionRegistrada } from '../store';

const punto = (lat: number, precisionM = 5) => ({
  lat,
  lng: -99.1332,
  precisionM,
  rumbo: 0,
  velocidadMs: 8,
  t: 0,
});

const det = (id: string, extra: Partial<DeteccionRegistrada> = {}): DeteccionRegistrada => ({
  id,
  recorridoId: 'r1',
  origen: 'auto',
  clase: 'bache',
  confianza: 0.8,
  bbox: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 },
  lat: 19.43,
  lng: -99.13,
  precisionM: 5,
  rumbo: 0,
  velocidadMs: 8,
  severidad: 'media',
  modeloVersion: 'test',
  capturadaEn: '2026-11-05T12:00:00.000Z',
  descartada: false,
  ...extra,
});

beforeEach(() => useRecorrido.getState().reiniciar());

describe('store del recorrido', () => {
  it('inicia y finaliza un recorrido', () => {
    const s = useRecorrido.getState();
    s.iniciar('r1', 1000);
    expect(useRecorrido.getState().recorrido).toMatchObject({ id: 'r1', inicio: 1000, distanciaM: 0 });
    useRecorrido.getState().finalizar(5000);
    expect(useRecorrido.getState().recorrido?.fin).toBe(5000);
  });

  it('acumula distancia del trazo e ignora puntos imprecisos', () => {
    const s = useRecorrido.getState();
    s.iniciar('r1', 0);
    s.agregarPunto(punto(19.4326));
    s.agregarPunto(punto(19.4336)); // +111 m
    s.agregarPunto(punto(19.4346, 50)); // impreciso, se ignora
    const r = useRecorrido.getState().recorrido!;
    expect(r.trazo).toHaveLength(2);
    expect(r.distanciaM).toBeCloseTo(111.2, 0);
  });

  it('no registra puntos sin recorrido activo', () => {
    useRecorrido.getState().agregarPunto(punto(19.4326));
    expect(useRecorrido.getState().recorrido).toBeNull();
  });

  it('registra y descarta detecciones (RF-20)', () => {
    const s = useRecorrido.getState();
    s.iniciar('r1', 0);
    s.registrar(det('a'));
    s.registrar(det('b'));
    s.descartar('a');
    const ds = useRecorrido.getState().detecciones;
    expect(ds.find((d) => d.id === 'a')?.descartada).toBe(true);
    expect(ds.find((d) => d.id === 'b')?.descartada).toBe(false);
  });

  it('ignora detecciones después de finalizar', () => {
    const s = useRecorrido.getState();
    s.iniciar('r1', 0);
    s.finalizar(10);
    s.registrar(det('a'));
    expect(useRecorrido.getState().detecciones).toHaveLength(0);
  });
});

describe('persistencia en la cola (RF-40)', () => {
  const llamadas: string[] = [];
  beforeEach(() => {
    llamadas.length = 0;
    configurarPersistencia({
      guardarRecorrido: (r, estado) => llamadas.push(`rec:${estado}:${r.trazo.length}`),
      guardarDeteccion: (d) => llamadas.push(`det:${d.id}`),
      descartar: (id) => llamadas.push(`desc:${id}`),
      confirmar: (id) => llamadas.push(`ok:${id}`),
    });
  });
  afterAll(() => configurarPersistencia(null));

  it('guarda cada cambio relevante del recorrido', () => {
    const s = useRecorrido.getState();
    s.iniciar('r1', 0);
    s.agregarPunto({ ...punto(19.4326), t: 1_000 }); // antes de 15 s: no guarda
    s.agregarPunto({ ...punto(19.4336), t: 16_000 }); // guarda trazo
    s.registrar(det('a'));
    s.descartar('a');
    s.finalizar(20_000);
    s.confirmar();
    expect(llamadas).toEqual(['rec:activo:0', 'rec:activo:2', 'det:a', 'desc:a', 'rec:en_revision:2', 'ok:r1']);
  });

  it('confirmar es idempotente (botón + salida de la pantalla)', () => {
    const s = useRecorrido.getState();
    s.iniciar('r1', 0);
    s.finalizar(10);
    s.confirmar();
    useRecorrido.getState().confirmar();
    expect(llamadas.filter((l) => l.startsWith('ok:'))).toEqual(['ok:r1']);
  });

  it('no confirma un recorrido sin finalizar', () => {
    useRecorrido.getState().iniciar('r1', 0);
    useRecorrido.getState().confirmar();
    expect(llamadas).toEqual(['rec:activo:0']);
  });
});

describe('resumir (RF-19)', () => {
  it('cuenta detecciones vigentes por clase y severidad', () => {
    const r = resumir([
      det('a', { clase: 'bache', severidad: 'alta' }),
      det('b', { clase: 'bache', severidad: 'baja' }),
      det('c', { clase: 'basura', severidad: 'media' }),
      det('d', { clase: 'bache', severidad: 'alta', descartada: true }),
    ]);
    expect(r.total).toBe(3);
    expect(r.porClase).toEqual({ bache: 2, basura: 1 });
    expect(r.porSeveridad).toEqual({ baja: 1, media: 1, alta: 1 });
  });
});
