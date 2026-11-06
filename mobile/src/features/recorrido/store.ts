import { create } from 'zustand';

import { distanceM } from '@/domain/geo';
import type { BBox, Clase, LatLng, Origen, Severidad } from '@/domain/types';

const PRECISION_MAX_TRAZO_M = 20;
const AVANCE_MIN_M = 2;

export interface PuntoGps extends LatLng {
  precisionM: number;
  rumbo: number;
  velocidadMs: number;
  t: number;
}

export interface DeteccionRegistrada {
  id: string;
  recorridoId: string;
  origen: Origen;
  clase: Clase;
  confianza: number;
  bbox: BBox;
  lat: number;
  lng: number;
  precisionM: number;
  rumbo: number;
  velocidadMs: number;
  severidad: Severidad;
  modeloVersion: string;
  capturadaEn: string;
  descartada: boolean;
}

export interface Recorrido {
  id: string;
  inicio: number;
  fin?: number;
  /** El operador terminó de revisar (RF-20). */
  confirmado?: boolean;
  trazo: LatLng[];
  distanciaM: number;
}

/** Escritura en la cola local; la registra el servicio de sync al iniciar la app. */
export interface Persistencia {
  guardarRecorrido(r: Recorrido, estado: 'activo' | 'en_revision'): void;
  guardarDeteccion(d: DeteccionRegistrada): void;
  descartar(id: string): void;
  /** El operador terminó de revisar: sus detecciones pueden subirse. */
  confirmar(recorridoId: string): void;
}

let persistencia: Persistencia | null = null;
export function configurarPersistencia(p: Persistencia | null) {
  persistencia = p;
}

const GUARDAR_TRAZO_CADA_MS = 15_000;
let ultimoGuardadoTrazo = 0;

interface RecorridoState {
  recorrido: Recorrido | null;
  detecciones: DeteccionRegistrada[];
  ultimoPunto: PuntoGps | null;
  iniciar(id: string, t: number): void;
  agregarPunto(p: PuntoGps): void;
  registrar(d: DeteccionRegistrada): void;
  descartar(id: string): void;
  finalizar(t: number): void;
  confirmar(): void;
  reiniciar(): void;
}

const activo = (r: Recorrido | null): r is Recorrido => r !== null && r.fin === undefined;

/**
 * Estado del recorrido en memoria. La persistencia en la cola SQLite (RF-40)
 * se conecta en `registrar` / `finalizar`.
 */
export const useRecorrido = create<RecorridoState>()((set, get) => ({
  recorrido: null,
  detecciones: [],
  ultimoPunto: null,

  iniciar: (id, t) => {
    const recorrido: Recorrido = { id, inicio: t, trazo: [], distanciaM: 0 };
    set({ recorrido, detecciones: [], ultimoPunto: null });
    ultimoGuardadoTrazo = t;
    persistencia?.guardarRecorrido(recorrido, 'activo');
  },

  agregarPunto: (p) => {
    const r = get().recorrido;
    if (!activo(r)) return;
    set({ ultimoPunto: p });
    if (p.precisionM > PRECISION_MAX_TRAZO_M) return;
    const prev = r.trazo.at(-1);
    const d = prev ? distanceM(prev, p) : 0;
    if (prev && d < AVANCE_MIN_M) return;
    const nuevo = { ...r, trazo: [...r.trazo, { lat: p.lat, lng: p.lng }], distanciaM: r.distanciaM + d };
    set({ recorrido: nuevo });
    if (p.t - ultimoGuardadoTrazo >= GUARDAR_TRAZO_CADA_MS) {
      ultimoGuardadoTrazo = p.t;
      persistencia?.guardarRecorrido(nuevo, 'activo');
    }
  },

  registrar: (d) => {
    if (!activo(get().recorrido)) return;
    set((s) => ({ detecciones: [...s.detecciones, d] }));
    persistencia?.guardarDeteccion(d);
  },

  descartar: (id) => {
    set((s) => ({ detecciones: s.detecciones.map((d) => (d.id === id ? { ...d, descartada: true } : d)) }));
    persistencia?.descartar(id);
  },

  finalizar: (t) => {
    const r = get().recorrido;
    if (!activo(r)) return;
    const fin = { ...r, fin: t };
    set({ recorrido: fin });
    persistencia?.guardarRecorrido(fin, 'en_revision');
  },

  confirmar: () => {
    const r = get().recorrido;
    if (r?.fin === undefined || r.confirmado) return;
    set({ recorrido: { ...r, confirmado: true } });
    persistencia?.confirmar(r.id);
  },

  reiniciar: () => set({ recorrido: null, detecciones: [], ultimoPunto: null }),
}));

export function resumir(detecciones: DeteccionRegistrada[]) {
  const vigentes = detecciones.filter((d) => !d.descartada);
  const porClase: Record<Clase, number> = { bache: 0, basura: 0 };
  const porSeveridad: Record<Severidad, number> = { baja: 0, media: 0, alta: 0 };
  for (const d of vigentes) {
    porClase[d.clase]++;
    porSeveridad[d.severidad]++;
  }
  return { total: vigentes.length, porClase, porSeveridad };
}
