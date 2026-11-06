import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { LatLng } from '@/domain/types';

/** Zócalo de la CDMX: centro por defecto si no hay permiso de ubicación. */
export const CENTRO_CDMX: LatLng = { lat: 19.4326, lng: -99.1332 };

/** Ubicación aproximada del ciudadano para centrar el mapa. No se envía al servidor (RNF-11). */
export function useMiUbicacion() {
  const [pos, setPos] = useState<LatLng | null>(null);
  const [permitida, setPermitida] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (cancelado) return;
      setPermitida(granted);
      if (!granted) return;
      const ultima = await Location.getLastKnownPositionAsync();
      if (ultima && !cancelado) setPos({ lat: ultima.coords.latitude, lng: ultima.coords.longitude });
      const actual = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!cancelado) setPos({ lat: actual.coords.latitude, lng: actual.coords.longitude });
    })().catch(() => !cancelado && setPermitida(false));
    return () => {
      cancelado = true;
    };
  }, []);

  return { pos, permitida };
}
