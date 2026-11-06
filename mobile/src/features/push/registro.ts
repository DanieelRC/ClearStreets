import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';

import { supabase } from '@/lib/supabase';

export const CANAL = 'incidencias';

/** Mostrar las notificaciones también con la app abierta. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type ResultadoRegistroPush = 'registrado' | 'sin_permiso' | 'sin_backend' | 'sin_project_id' | 'error';

/**
 * Pide permiso, crea el canal de Android y guarda el token de Expo en `dispositivos_push`.
 * Requiere sesión iniciada y `extra.eas.projectId` (lo agrega `eas init`).
 */
export async function registrarPush(pedirPermiso = true): Promise<ResultadoRegistroPush> {
  if (!supabase) return 'sin_backend';
  try {
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Incidencias que sigues',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });

    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted && pedirPermiso) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return 'sin_permiso';

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return 'sin_project_id';

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('registrar_dispositivo', { p_token: token });
    return error ? 'error' : 'registrado';
  } catch {
    return 'error';
  }
}
