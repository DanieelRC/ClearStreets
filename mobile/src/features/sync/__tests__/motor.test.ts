import type { DeteccionRegistrada } from '@/features/recorrido/store';

import { siguienteIntento, sincronizar } from '../motor';
import {
  ErrorRed,
  type ColaRepo,
  type DeteccionCola,
  type Pendientes,
  type RecorridoCola,
  type Resultado,
  type SyncApi,
} from '../tipos';

const AHORA = 1_000_000;
const ctl = { intentos: 0, proximoIntento: 0, ultimoError: null };

const rec = (id: string, extra: Partial<RecorridoCola> = {}): RecorridoCola => ({
  id,
  inicio: 0,
  fin: 10,
  distanciaM: 100,
  trazo: [],
  estado: 'listo',
  rev: 1,
  pendiente: true,
  subido: false,
  ...ctl,
  ...extra,
});

const det = (id: string, recorridoId = 'r1', extra: Partial<DeteccionRegistrada> = {}, c = {}): DeteccionCola => ({
  ...ctl,
  ...c,
  datos: {
    id,
    recorridoId,
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
    modeloVersion: 'v',
    capturadaEn: '2026-11-05T12:00:00.000Z',
    descartada: false,
    ...extra,
  },
});

function fakeRepo(p: Pendientes) {
  const recorridos: Record<string, Resultado> = {};
  const detecciones: Record<string, Resultado> = {};
  const repo: ColaRepo = {
    pendientes: async () => p,
    marcarRecorrido: async (rc, r) => void (recorridos[rc.id] = r),
    marcarDeteccion: async (id, r) => void (detecciones[id] = r),
  };
  return { repo, recorridos, detecciones };
}

function fakeApi(fallar: (tipo: string, id: string) => Error | undefined = () => undefined) {
  const llamadas: string[] = [];
  const api: SyncApi = {
    usuarioId: async () => 'u1',
    subirRecorrido: async (r) => {
      llamadas.push(`rec:${r.id}`);
      const e = fallar('rec', r.id);
      if (e) throw e;
    },
    registrarDeteccion: async (d) => {
      llamadas.push(`det:${d.id}`);
      const e = fallar('det', d.id);
      if (e) throw e;
    },
  };
  return { api, llamadas };
}

describe('siguienteIntento', () => {
  it('crece exponencialmente desde 5 s', () => {
    expect(siguienteIntento(0, AHORA)).toBe(AHORA + 5_000);
    expect(siguienteIntento(3, AHORA)).toBe(AHORA + 40_000);
  });
  it('se limita a 30 min', () => {
    expect(siguienteIntento(20, AHORA)).toBe(AHORA + 30 * 60_000);
  });
});

describe('sincronizar', () => {
  it('sin sesión no sube nada', async () => {
    const { repo } = fakeRepo({ recorridos: [rec('r1')], detecciones: [det('a')], recorridosDe: {} });
    const { api, llamadas } = fakeApi();
    api.usuarioId = async () => null;
    const r = await sincronizar({ repo, api, ahora: AHORA });
    expect(r.estado).toBe('sin_sesion');
    expect(llamadas).toEqual([]);
  });

  it('sube primero el recorrido y luego sus detecciones', async () => {
    const { repo, recorridos, detecciones } = fakeRepo({
      recorridos: [rec('r1')],
      detecciones: [det('a'), det('b')],
      recorridosDe: { r1: { estado: 'listo', subido: false } },
    });
    const { api, llamadas } = fakeApi();
    const r = await sincronizar({ repo, api, ahora: AHORA });
    expect(llamadas).toEqual(['rec:r1', 'det:a', 'det:b']);
    expect(recorridos.r1).toEqual({ ok: true });
    expect(detecciones).toEqual({ a: { ok: true }, b: { ok: true } });
    expect(r).toMatchObject({ estado: 'ok', subidos: 3, fallidos: 0 });
  });

  it('no sube detecciones de un recorrido en revisión (RF-20)', async () => {
    const { repo } = fakeRepo({
      recorridos: [rec('r1', { estado: 'en_revision', fin: 10 })],
      detecciones: [det('a')],
      recorridosDe: { r1: { estado: 'en_revision', subido: false } },
    });
    const { api, llamadas } = fakeApi();
    await sincronizar({ repo, api, ahora: AHORA });
    expect(llamadas).toEqual(['rec:r1']);
  });

  it('marca las descartadas sin enviarlas', async () => {
    const { repo, detecciones } = fakeRepo({
      recorridos: [],
      detecciones: [det('a', 'r1', { descartada: true })],
      recorridosDe: { r1: { estado: 'listo', subido: true } },
    });
    const { api, llamadas } = fakeApi();
    await sincronizar({ repo, api, ahora: AHORA });
    expect(llamadas).toEqual([]);
    expect(detecciones.a).toEqual({ ok: true });
  });

  it('respeta proximoIntento salvo en reintento manual', async () => {
    const p: Pendientes = {
      recorridos: [rec('r1', { subido: true, proximoIntento: AHORA + 1 })],
      detecciones: [det('a', 'r1', {}, { proximoIntento: AHORA + 1 })],
      recorridosDe: { r1: { estado: 'listo', subido: true } },
    };
    const a = fakeApi();
    await sincronizar({ repo: fakeRepo(p).repo, api: a.api, ahora: AHORA });
    expect(a.llamadas).toEqual([]);
    const b = fakeApi();
    await sincronizar({ repo: fakeRepo(p).repo, api: b.api, ahora: AHORA, forzar: true });
    expect(b.llamadas).toEqual(['rec:r1', 'det:a']);
  });

  it('programa reintento con backoff cuando falla una detección', async () => {
    const { repo, detecciones } = fakeRepo({
      recorridos: [],
      detecciones: [det('a', 'r1', {}, { intentos: 2 }), det('b')],
      recorridosDe: { r1: { estado: 'listo', subido: true } },
    });
    const { api } = fakeApi((t, id) => (id === 'a' ? new Error('violación RLS') : undefined));
    const r = await sincronizar({ repo, api, ahora: AHORA });
    expect(detecciones.a).toEqual({ ok: false, error: 'violación RLS', proximoIntento: AHORA + 20_000 });
    expect(detecciones.b).toEqual({ ok: true });
    expect(r).toMatchObject({ estado: 'parcial', subidos: 1, fallidos: 1 });
  });

  it('si el recorrido falla, sus detecciones esperan', async () => {
    const { repo, detecciones } = fakeRepo({
      recorridos: [rec('r1')],
      detecciones: [det('a')],
      recorridosDe: { r1: { estado: 'listo', subido: false } },
    });
    const { api, llamadas } = fakeApi((t) => (t === 'rec' ? new Error('x') : undefined));
    await sincronizar({ repo, api, ahora: AHORA });
    expect(llamadas).toEqual(['rec:r1']);
    expect(detecciones.a).toBeUndefined();
  });

  it('un error de red detiene la pasada sin consumir intentos de lo demás', async () => {
    const { repo, detecciones } = fakeRepo({
      recorridos: [],
      detecciones: [det('a'), det('b')],
      recorridosDe: { r1: { estado: 'listo', subido: true } },
    });
    const { api, llamadas } = fakeApi(() => new ErrorRed('Network request failed'));
    const r = await sincronizar({ repo, api, ahora: AHORA });
    expect(llamadas).toEqual(['det:a']);
    expect(detecciones.a).toBeUndefined();
    expect(r.estado).toBe('sin_red');
  });
});
