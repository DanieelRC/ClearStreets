import type { SQLiteDatabase } from 'expo-sqlite';

import type { DeteccionRegistrada, Recorrido } from '@/features/recorrido/store';

import type { ColaRepo, EstadoRecorrido, Pendientes, RecorridoCola, Resultado } from './tipos';

const VERSION_ESQUEMA = 1;

/** Crea/migra el esquema local (PRAGMA user_version). */
export async function migrar(db: SQLiteDatabase) {
  const fila = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const v = fila?.user_version ?? 0;
  if (v >= VERSION_ESQUEMA) return;
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS recorridos (
      id TEXT PRIMARY KEY NOT NULL,
      inicio INTEGER NOT NULL,
      fin INTEGER,
      distancia_m REAL NOT NULL DEFAULT 0,
      trazo TEXT NOT NULL DEFAULT '[]',
      estado TEXT NOT NULL DEFAULT 'activo',
      rev INTEGER NOT NULL DEFAULT 1,
      rev_subida INTEGER NOT NULL DEFAULT 0,
      intentos INTEGER NOT NULL DEFAULT 0,
      proximo_intento INTEGER NOT NULL DEFAULT 0,
      ultimo_error TEXT
    );
    CREATE TABLE IF NOT EXISTS detecciones (
      id TEXT PRIMARY KEY NOT NULL,
      recorrido_id TEXT NOT NULL REFERENCES recorridos (id),
      datos TEXT NOT NULL,
      descartada INTEGER NOT NULL DEFAULT 0,
      sincronizada INTEGER NOT NULL DEFAULT 0,
      intentos INTEGER NOT NULL DEFAULT 0,
      proximo_intento INTEGER NOT NULL DEFAULT 0,
      ultimo_error TEXT,
      creada_en INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS detecciones_pendientes ON detecciones (sincronizada, recorrido_id);
    PRAGMA user_version = ${VERSION_ESQUEMA};
  `);
}

interface FilaRecorrido {
  id: string;
  inicio: number;
  fin: number | null;
  distancia_m: number;
  trazo: string;
  estado: EstadoRecorrido;
  rev: number;
  rev_subida: number;
  intentos: number;
  proximo_intento: number;
  ultimo_error: string | null;
}

interface FilaDeteccion {
  datos: string;
  descartada: number;
  intentos: number;
  proximo_intento: number;
  ultimo_error: string | null;
}

const aRecorrido = (f: FilaRecorrido): RecorridoCola => ({
  id: f.id,
  inicio: f.inicio,
  fin: f.fin,
  distanciaM: f.distancia_m,
  trazo: JSON.parse(f.trazo),
  estado: f.estado,
  rev: f.rev,
  pendiente: f.rev > f.rev_subida,
  subido: f.rev_subida > 0,
  intentos: f.intentos,
  proximoIntento: f.proximo_intento,
  ultimoError: f.ultimo_error,
});

export interface ConteoCola {
  detecciones: number;
  recorridos: number;
  conError: number;
  enRevision: number;
  ultimoError: string | null;
}

/** Cola local persistente (RF-40, RF-44). */
export function crearCola(db: SQLiteDatabase) {
  const repo: ColaRepo = {
    async pendientes(): Promise<Pendientes> {
      // Recorridos con cambios sin subir, más los referenciados por detecciones pendientes.
      const recs = await db.getAllAsync<FilaRecorrido>(
        'SELECT * FROM recorridos WHERE rev > rev_subida OR id IN (SELECT recorrido_id FROM detecciones WHERE sincronizada = 0)',
      );
      const dets = await db.getAllAsync<FilaDeteccion>(
        'SELECT datos, descartada, intentos, proximo_intento, ultimo_error FROM detecciones WHERE sincronizada = 0 ORDER BY creada_en',
      );
      const todos = recs.map(aRecorrido);
      return {
        recorridos: todos.filter((r) => r.pendiente),
        recorridosDe: Object.fromEntries(todos.map((r) => [r.id, { estado: r.estado, subido: r.subido }])),
        detecciones: dets.map((f) => ({
          datos: { ...(JSON.parse(f.datos) as DeteccionRegistrada), descartada: f.descartada === 1 },
          intentos: f.intentos,
          proximoIntento: f.proximo_intento,
          ultimoError: f.ultimo_error,
        })),
      };
    },

    async marcarRecorrido(r: RecorridoCola, res: Resultado) {
      if (res.ok) {
        await db.runAsync(
          'UPDATE recorridos SET rev_subida = ?, intentos = 0, proximo_intento = 0, ultimo_error = NULL WHERE id = ?',
          [r.rev, r.id],
        );
      } else {
        await db.runAsync(
          'UPDATE recorridos SET intentos = intentos + 1, proximo_intento = ?, ultimo_error = ? WHERE id = ?',
          [res.proximoIntento, res.error, r.id],
        );
      }
    },

    async marcarDeteccion(id: string, res: Resultado) {
      if (res.ok) {
        await db.runAsync('UPDATE detecciones SET sincronizada = 1, ultimo_error = NULL WHERE id = ?', [id]);
      } else {
        await db.runAsync(
          'UPDATE detecciones SET intentos = intentos + 1, proximo_intento = ?, ultimo_error = ? WHERE id = ?',
          [res.proximoIntento, res.error, id],
        );
      }
    },
  };

  return {
    repo,

    async guardarRecorrido(r: Recorrido, estado: EstadoRecorrido) {
      await db.runAsync(
        `INSERT INTO recorridos (id, inicio, fin, distancia_m, trazo, estado) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET fin = excluded.fin, distancia_m = excluded.distancia_m,
           trazo = excluded.trazo, estado = excluded.estado, rev = rev + 1`,
        [r.id, r.inicio, r.fin ?? null, r.distanciaM, JSON.stringify(r.trazo), estado],
      );
    },

    async cambiarEstado(id: string, estado: EstadoRecorrido) {
      await db.runAsync('UPDATE recorridos SET estado = ?, rev = rev + 1 WHERE id = ?', [estado, id]);
    },

    async guardarDeteccion(d: DeteccionRegistrada) {
      await db.runAsync(
        'INSERT OR IGNORE INTO detecciones (id, recorrido_id, datos, descartada, creada_en) VALUES (?, ?, ?, ?, ?)',
        [d.id, d.recorridoId, JSON.stringify(d), d.descartada ? 1 : 0, Date.parse(d.capturadaEn)],
      );
    },

    async descartar(id: string) {
      await db.runAsync('UPDATE detecciones SET descartada = 1 WHERE id = ? AND sincronizada = 0', [id]);
    },

    /** Recorridos que quedaron abiertos por cierre de la app: se cierran y quedan listos. */
    async cerrarHuerfanos(excepto: string | null) {
      await db.runAsync(
        `UPDATE recorridos SET
           fin = COALESCE(fin, (SELECT MAX(creada_en) FROM detecciones d WHERE d.recorrido_id = recorridos.id), inicio),
           estado = 'listo', rev = rev + 1
         WHERE estado <> 'listo' AND id IS NOT ?`,
        [excepto],
      );
    },

    /** Reintento manual: todo vuelve a intentarse de inmediato (RF-43). */
    async reprogramar() {
      await db.execAsync(`
        UPDATE recorridos SET proximo_intento = 0 WHERE rev > rev_subida;
        UPDATE detecciones SET proximo_intento = 0 WHERE sincronizada = 0;
      `);
    },

    async conteo(): Promise<ConteoCola> {
      const c = await db.getFirstAsync<{ d: number; r: number; e: number; rv: number }>(`
        SELECT
          (SELECT COUNT(*) FROM detecciones WHERE sincronizada = 0 AND descartada = 0) AS d,
          (SELECT COUNT(*) FROM recorridos WHERE rev > rev_subida) AS r,
          (SELECT COUNT(*) FROM detecciones WHERE sincronizada = 0 AND ultimo_error IS NOT NULL)
            + (SELECT COUNT(*) FROM recorridos WHERE rev > rev_subida AND ultimo_error IS NOT NULL) AS e,
          (SELECT COUNT(*) FROM recorridos WHERE estado = 'en_revision') AS rv
      `);
      const err = await db.getFirstAsync<{ ultimo_error: string }>(`
        SELECT ultimo_error FROM detecciones WHERE ultimo_error IS NOT NULL AND sincronizada = 0
        UNION ALL SELECT ultimo_error FROM recorridos WHERE ultimo_error IS NOT NULL AND rev > rev_subida
        LIMIT 1
      `);
      return {
        detecciones: c?.d ?? 0,
        recorridos: c?.r ?? 0,
        conError: c?.e ?? 0,
        enRevision: c?.rv ?? 0,
        ultimoError: err?.ultimo_error ?? null,
      };
    },
  };
}

export type Cola = ReturnType<typeof crearCola>;
