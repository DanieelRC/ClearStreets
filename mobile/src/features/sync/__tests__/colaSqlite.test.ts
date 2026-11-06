/**
 * @jest-environment node
 *
 * Prueba el SQL real de la cola con node:sqlite (Node ≥ 22.5) envuelto en la
 * misma API async que expo-sqlite. Se omite si node:sqlite no está disponible.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import type { DeteccionRegistrada, Recorrido } from '@/features/recorrido/store';

import { crearCola, migrar } from '../colaSqlite';
import { sincronizar } from '../motor';
import type { SyncApi } from '../tipos';

let sqlite: typeof import('node:sqlite') | undefined;
try {
  // require dinámico: permite omitir la suite en versiones de Node sin node:sqlite.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sqlite = require('node:sqlite');
} catch {
  sqlite = undefined;
}
const describeSiHay = sqlite ? describe : describe.skip;

function abrir(): SQLiteDatabase {
  const db = new sqlite!.DatabaseSync(':memory:');
  const args = (p?: unknown[]) => (p ?? []) as (string | number | null)[];
  return {
    execAsync: async (s: string) => db.exec(s),
    runAsync: async (s: string, p?: unknown[]) => db.prepare(s).run(...args(p)),
    getAllAsync: async (s: string, p?: unknown[]) => db.prepare(s).all(...args(p)),
    getFirstAsync: async (s: string, p?: unknown[]) => db.prepare(s).get(...args(p)) ?? null,
  } as unknown as SQLiteDatabase;
}

const recorrido = (extra: Partial<Recorrido> = {}): Recorrido => ({
  id: 'r1',
  inicio: 1000,
  trazo: [{ lat: 19.43, lng: -99.13 }],
  distanciaM: 0,
  ...extra,
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
  modeloVersion: 'v',
  capturadaEn: '2026-11-05T12:00:00.000Z',
  descartada: false,
  ...extra,
});

function api(fallarDet?: string) {
  const llamadas: string[] = [];
  const a: SyncApi = {
    usuarioId: async () => 'u1',
    subirRecorrido: async (r) => void llamadas.push(`rec:${r.id}:${r.estado}`),
    registrarDeteccion: async (d) => {
      llamadas.push(`det:${d.id}`);
      if (d.id === fallarDet) throw new Error('falla');
    },
  };
  return { a, llamadas };
}

describeSiHay('cola SQLite + motor', () => {
  let db: SQLiteDatabase;
  let cola: ReturnType<typeof crearCola>;

  beforeEach(async () => {
    db = abrir();
    await migrar(db);
    await migrar(db); // idempotente
    cola = crearCola(db);
  });

  it('flujo completo: recorrido en revisión → listo → sincronizado', async () => {
    await cola.guardarRecorrido(recorrido(), 'activo');
    await cola.guardarDeteccion(det('a'));
    await cola.guardarDeteccion(det('a')); // duplicado ignorado
    await cola.guardarDeteccion(det('b'));
    await cola.guardarRecorrido(recorrido({ fin: 5000, distanciaM: 120 }), 'en_revision');
    await cola.descartar('b');

    expect(await cola.conteo()).toMatchObject({ detecciones: 1, recorridos: 1, enRevision: 1 });

    // En revisión: solo se sube el recorrido.
    const p1 = api();
    await sincronizar({ repo: cola.repo, api: p1.a, ahora: 0 });
    expect(p1.llamadas).toEqual(['rec:r1:en_revision']);

    // El operador confirma → listo: se sube el cambio de estado y la detección no descartada.
    await cola.cambiarEstado('r1', 'listo');
    const p2 = api();
    await sincronizar({ repo: cola.repo, api: p2.a, ahora: 0 });
    expect(p2.llamadas).toEqual(['rec:r1:listo', 'det:a']);

    expect(await cola.conteo()).toMatchObject({ detecciones: 0, recorridos: 0, conError: 0 });
    const p3 = api();
    await sincronizar({ repo: cola.repo, api: p3.a, ahora: 0 });
    expect(p3.llamadas).toEqual([]);
  });

  it('un error queda registrado y se reintenta tras reprogramar', async () => {
    await cola.guardarRecorrido(recorrido({ fin: 2000 }), 'listo');
    await cola.guardarDeteccion(det('a'));
    await sincronizar({ repo: cola.repo, api: api('a').a, ahora: 0 });
    expect(await cola.conteo()).toMatchObject({ detecciones: 1, conError: 1, ultimoError: 'falla' });

    // Dentro del backoff no se reintenta.
    const p = api();
    await sincronizar({ repo: cola.repo, api: p.a, ahora: 1 });
    expect(p.llamadas).toEqual([]);

    await cola.reprogramar();
    const q = api();
    await sincronizar({ repo: cola.repo, api: q.a, ahora: 1 });
    expect(q.llamadas).toEqual(['det:a']);
    expect(await cola.conteo()).toMatchObject({ detecciones: 0, conError: 0 });
  });

  it('un cambio local durante la subida mantiene el recorrido pendiente', async () => {
    await cola.guardarRecorrido(recorrido(), 'activo');
    const { recorridos } = await cola.repo.pendientes();
    await cola.guardarRecorrido(recorrido({ distanciaM: 50 }), 'activo'); // rev 2
    await cola.repo.marcarRecorrido(recorridos[0], { ok: true }); // subió rev 1
    expect((await cola.conteo()).recorridos).toBe(1);
  });

  it('cierra recorridos huérfanos al iniciar la app', async () => {
    await cola.guardarRecorrido(recorrido({ id: 'viejo' }), 'activo');
    await cola.guardarDeteccion(det('x', { recorridoId: 'viejo', capturadaEn: '2026-11-05T12:00:09.000Z' }));
    await cola.guardarRecorrido(recorrido({ id: 'actual' }), 'activo');
    await cola.cerrarHuerfanos('actual');
    const { recorridosDe, recorridos } = await cola.repo.pendientes();
    expect(recorridosDe.viejo.estado).toBe('listo');
    expect(recorridos.find((r) => r.id === 'viejo')?.fin).toBe(Date.parse('2026-11-05T12:00:09.000Z'));
    expect(recorridos.find((r) => r.id === 'actual')?.estado).toBe('activo');
  });
});
