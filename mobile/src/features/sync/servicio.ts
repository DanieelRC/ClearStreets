import { openDatabaseAsync } from 'expo-sqlite';
import { addNetworkStateListener } from 'expo-network';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { configurarPersistencia } from '@/features/recorrido/store';

import { apiSupabase } from './apiSupabase';
import { crearCola, migrar, type Cola, type ConteoCola } from './colaSqlite';
import { sincronizar, type ResultadoSync } from './motor';

const PERIODO_MS = 60_000;

interface EstadoSync {
  /** La base local está abierta: ya se puede iniciar un recorrido sin perder datos. */
  listo: boolean;
  sincronizando: boolean;
  conteo: ConteoCola;
  ultimo?: ResultadoSync & { fecha: number };
  error?: string;
}

export const useSync = create<EstadoSync>()(() => ({
  listo: false,
  sincronizando: false,
  conteo: { detecciones: 0, recorridos: 0, conError: 0, enRevision: 0, ultimoError: null },
}));

let cola: Cola | null = null;
let enCurso: Promise<void> | null = null;
let pendiente: { forzar: boolean } | null = null;

async function refrescarConteo() {
  if (cola) useSync.setState({ conteo: await cola.conteo() });
}

/**
 * Lanza una pasada de sincronización. Si ya hay una en curso, agenda otra al terminar
 * (single-flight) sin perder un reintento manual. `forzar` ignora el backoff (RF-43).
 */
export function solicitarSync(forzar = false): Promise<void> {
  if (!cola) return Promise.resolve();
  if (enCurso) {
    pendiente = { forzar: forzar || (pendiente?.forzar ?? false) };
    return enCurso;
  }
  const c = cola;
  pendiente = { forzar };
  enCurso = (async () => {
    useSync.setState({ sincronizando: true, error: undefined });
    try {
      while (pendiente) {
        const { forzar: f } = pendiente;
        pendiente = null;
        if (f) await c.reprogramar();
        const r = await sincronizar({ repo: c.repo, api: apiSupabase, ahora: Date.now(), forzar: f });
        useSync.setState({ ultimo: { ...r, fecha: Date.now() } });
      }
    } catch (e) {
      useSync.setState({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      pendiente = null;
      await refrescarConteo();
      useSync.setState({ sincronizando: false });
      enCurso = null;
    }
  })();
  return enCurso;
}

let arranque: Promise<void> | null = null;

/** Abre la base local, conecta el store y programa los disparadores. Idempotente; vive toda la app. */
export function iniciarSync(): Promise<void> {
  arranque ??= (async () => {
    const db = await openDatabaseAsync('clearstreets.db');
    await migrar(db);
    const c = crearCola(db);
    await c.cerrarHuerfanos(null);
    cola = c;

    const tras = (p: Promise<unknown>) => p.then(refrescarConteo).catch((e) => useSync.setState({ error: String(e) }));
    configurarPersistencia({
      guardarRecorrido: (r, estado) => tras(c.guardarRecorrido(r, estado)),
      guardarDeteccion: (d) => tras(c.guardarDeteccion(d)),
      descartar: (id) => tras(c.descartar(id)),
      confirmar: (id) => tras(c.cambiarEstado(id, 'listo').then(() => solicitarSync())),
    });

    useSync.setState({ listo: true });
    await refrescarConteo();
    solicitarSync();

    addNetworkStateListener((s) => {
      if (s.isConnected && s.isInternetReachable !== false) solicitarSync();
    });
    AppState.addEventListener('change', (s) => {
      if (s === 'active') solicitarSync();
    });
    setInterval(() => solicitarSync(), PERIODO_MS);
  })().catch((e) => {
    arranque = null; // permite reintentar
    useSync.setState({ error: `No se pudo abrir la base local: ${e}` });
  });
  return arranque;
}
