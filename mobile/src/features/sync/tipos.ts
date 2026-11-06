import type { LatLng } from '@/domain/types';
import type { DeteccionRegistrada } from '@/features/recorrido/store';

/**
 * activo: en curso · en_revision: finalizado, el operador puede descartar (RF-20)
 * listo: sus detecciones ya pueden subirse.
 */
export type EstadoRecorrido = 'activo' | 'en_revision' | 'listo';

export interface ControlSync {
  intentos: number;
  proximoIntento: number; // epoch ms
  ultimoError: string | null;
}

export interface RecorridoCola extends ControlSync {
  id: string;
  inicio: number;
  fin: number | null;
  distanciaM: number;
  trazo: LatLng[];
  estado: EstadoRecorrido;
  /** Revisión local; se incrementa con cada cambio. */
  rev: number;
  /** Hay cambios locales sin subir. */
  pendiente: boolean;
  /** Existe en el servidor (las detecciones lo referencian por FK). */
  subido: boolean;
}

export interface DeteccionCola extends ControlSync {
  datos: DeteccionRegistrada;
}

export interface Pendientes {
  recorridos: RecorridoCola[];
  detecciones: DeteccionCola[];
  /** Estado/subida de los recorridos referenciados por `detecciones`. */
  recorridosDe: Record<string, Pick<RecorridoCola, 'estado' | 'subido'>>;
}

export type Resultado = { ok: true } | { ok: false; error: string; proximoIntento: number };

export interface ColaRepo {
  /** Todo lo no sincronizado (incluye descartadas y lo que aún está en espera). */
  pendientes(): Promise<Pendientes>;
  /** Recibe el recorrido tal como se leyó: si cambió localmente (rev) sigue pendiente. */
  marcarRecorrido(r: RecorridoCola, res: Resultado): Promise<void>;
  marcarDeteccion(id: string, r: Resultado): Promise<void>;
}

export interface SyncApi {
  usuarioId(): Promise<string | null>;
  subirRecorrido(r: RecorridoCola, operadorId: string): Promise<void>;
  registrarDeteccion(d: DeteccionRegistrada): Promise<void>;
}

/** Fallo de conectividad: se detiene la pasada actual. */
export class ErrorRed extends Error {}
