/**
 * Modo conducción (RF-80–83): actualizaciones de ubicación en un servicio en primer plano
 * de Android, que sigue activo con la pantalla apagada. Este módulo debe importarse en el
 * ámbito global (layout raíz) para que `defineTask` exista cuando Android despierte la app.
 */
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import Storage from 'expo-sqlite/kv-store';
import * as TaskManager from 'expo-task-manager';

import type { LatLng } from '@/domain/types';
import { supabase } from '@/lib/supabase';

import { CONFIG_ALERTAS, evaluarAlerta, filtrarParaCache, necesitaRecarga, podarHistorial, type Historial, type PuntoAlerta } from './logica';

export const TAREA = 'clearstreets-modo-conduccion';
const CANAL_ALERTAS = 'alertas-baches';
const K_CACHE = 'conduccion.cache';
const K_HISTORIAL = 'conduccion.historial';
const K_ESTADO = 'conduccion.estado';

export interface CacheAlertas {
  centro: LatLng;
  fecha: number;
  puntos: PuntoAlerta[];
}

/** Lo que la pantalla muestra; lo escribe la tarea. */
export interface EstadoConduccion {
  ultimaPosicion?: number;
  ultimaAlerta?: { id: number; distanciaM: number; fecha: number };
  enCache: number;
  cacheFecha?: number;
  error?: string;
}

const leer = async <T>(k: string): Promise<T | null> => {
  const v = await Storage.getItemAsync(k);
  return v ? (JSON.parse(v) as T) : null;
};
const escribir = (k: string, v: unknown) => Storage.setItemAsync(k, JSON.stringify(v));

export const leerEstadoConduccion = () => leer<EstadoConduccion>(K_ESTADO);

async function recargar(pos: LatLng): Promise<CacheAlertas | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('incidencias_cercanas', {
    p_lat: pos.lat,
    p_lng: pos.lng,
    p_radio_m: CONFIG_ALERTAS.radioCacheM,
  });
  if (error) throw new Error(error.message);
  const cache: CacheAlertas = { centro: pos, fecha: Date.now(), puntos: filtrarParaCache(data as PuntoAlerta[]) };
  await escribir(K_CACHE, cache);
  return cache;
}

async function avisar(distanciaM: number) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '⚠ Bache grave adelante',
      body: `A unos ${Math.round(distanciaM / 10) * 10} m. Reduce la velocidad.`,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
    },
    trigger: { channelId: CANAL_ALERTAS },
  });
}

let procesando = false;

async function procesar(loc: Location.LocationObject) {
  const ahora = Date.now();
  const pos = { lat: loc.coords.latitude, lng: loc.coords.longitude };
  const estado: EstadoConduccion = (await leer<EstadoConduccion>(K_ESTADO)) ?? { enCache: 0 };
  estado.ultimaPosicion = ahora;
  estado.error = undefined;

  let cache = await leer<CacheAlertas>(K_CACHE);
  if (necesitaRecarga(cache, pos, ahora)) {
    try {
      cache = (await recargar(pos)) ?? cache;
    } catch (e) {
      // Sin red: se sigue usando la caché anterior (RF-82).
      estado.error = e instanceof Error ? e.message : String(e);
    }
  }
  estado.enCache = cache?.puntos.length ?? 0;
  estado.cacheFecha = cache?.fecha;

  if (cache) {
    const historial = podarHistorial((await leer<Historial>(K_HISTORIAL)) ?? {}, ahora);
    const alerta = evaluarAlerta(
      { pos, rumbo: loc.coords.heading ?? -1, velocidadMs: loc.coords.speed ?? 0 },
      cache.puntos,
      historial,
      ahora,
    );
    if (alerta) {
      historial[alerta.punto.id] = ahora;
      estado.ultimaAlerta = { id: alerta.punto.id, distanciaM: alerta.distanciaM, fecha: ahora };
      await avisar(alerta.distanciaM);
    }
    await escribir(K_HISTORIAL, historial);
  }
  await escribir(K_ESTADO, estado);
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TAREA, async ({ data, error }) => {
  if (error || !data?.locations?.length || procesando) return;
  procesando = true;
  try {
    await procesar(data.locations[data.locations.length - 1]);
  } catch (e) {
    console.warn('Modo conducción:', e);
  } finally {
    procesando = false;
  }
});

export type ResultadoInicio = 'activo' | 'sin_permiso_ubicacion' | 'sin_permiso_notificaciones' | 'error';

/** Debe llamarse con la app en primer plano (requisito de Android para el servicio). */
export async function iniciarModoConduccion(): Promise<ResultadoInicio> {
  try {
    if (!(await Location.requestForegroundPermissionsAsync()).granted) return 'sin_permiso_ubicacion';
    // Android 13+: sin este permiso no se ven ni las alertas ni la notificación del servicio.
    if (!(await Notifications.requestPermissionsAsync()).granted) return 'sin_permiso_notificaciones';

    await Notifications.setNotificationChannelAsync(CANAL_ALERTAS, {
      name: 'Alertas de baches al conducir',
      importance: AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 400, 200, 400],
      enableVibrate: true,
    });

    await Location.startLocationUpdatesAsync(TAREA, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 2000,
      distanceInterval: 10,
      foregroundService: {
        notificationTitle: 'Modo conducción activo',
        notificationBody: 'ClearStreets te avisará de baches graves en tu camino.',
        notificationColor: '#0F766E',
        killServiceOnDestroy: false,
      },
    });
    return 'activo';
  } catch (e) {
    console.warn('No se pudo iniciar el modo conducción:', e);
    return 'error';
  }
}

export async function detenerModoConduccion() {
  if (await Location.hasStartedLocationUpdatesAsync(TAREA)) await Location.stopLocationUpdatesAsync(TAREA);
}

export const modoConduccionActivo = () => Location.hasStartedLocationUpdatesAsync(TAREA).catch(() => false);
