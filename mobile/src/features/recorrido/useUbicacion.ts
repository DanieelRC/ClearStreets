import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useRecorrido } from './store';

const VELOCIDAD_DETENIDO_MS = 3 / 3.6; // 3 km/h
const TIEMPO_DETENIDO_MS = 60_000;

export type EstadoUbicacion = 'solicitando' | 'denegada' | 'activa' | 'error';

/**
 * Sigue la ubicación en alta precisión mientras `activo` sea true y la envía al store.
 * `detenido()` indica si el vehículo lleva > 60 s a < 3 km/h (RF-16).
 */
export function useUbicacion(activo: boolean) {
  const [estado, setEstado] = useState<EstadoUbicacion>('solicitando');
  const agregarPunto = useRecorrido((s) => s.agregarPunto);
  const ultimoMovimiento = useRef(0); // se inicializa al activar

  useEffect(() => {
    if (!activo) return;
    let sub: Location.LocationSubscription | undefined;
    let cancelado = false;

    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (cancelado) return;
      if (!granted) {
        setEstado('denegada');
        return;
      }
      try {
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
          (loc) => {
            const v = loc.coords.speed ?? 0;
            if (v >= VELOCIDAD_DETENIDO_MS) ultimoMovimiento.current = loc.timestamp;
            agregarPunto({
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              precisionM: loc.coords.accuracy ?? Infinity,
              rumbo: loc.coords.heading ?? 0,
              velocidadMs: v,
              t: loc.timestamp,
            });
          },
          () => setEstado('error'),
        );
        if (cancelado) sub.remove();
        else setEstado('activa');
      } catch {
        setEstado('error');
      }
    })();

    ultimoMovimiento.current = Date.now();
    return () => {
      cancelado = true;
      sub?.remove();
    };
  }, [activo, agregarPunto]);

  // Estable: si cambiara en cada render, el callback de fotogramas se reinstalaría en cada cuadro.
  const detenido = useCallback(
    () => ultimoMovimiento.current > 0 && Date.now() - ultimoMovimiento.current > TIEMPO_DETENIDO_MS,
    [],
  );

  return { estado, detenido };
}
