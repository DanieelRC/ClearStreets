import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

// Registra la tarea del modo conducción en el ámbito global (requisito de expo-task-manager).
import '@/features/alertas/tarea';
import { incidenciaDeNotificacion } from '@/features/push/datos';
import { registrarPush } from '@/features/push/registro';
import { iniciarSync, solicitarSync } from '@/features/sync/servicio';
import { supabase } from '@/lib/supabase';

const queryClient = new QueryClient();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const respuesta = Notifications.useLastNotificationResponse();

  const navegacion = useRootNavigationState();

  useEffect(() => {
    iniciarSync();
  }, []);

  // Con sesión: sincronizar la cola y refrescar el token push (sin pedir permiso aquí, RF-05).
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((evento, session) => {
      if (session && (evento === 'SIGNED_IN' || evento === 'INITIAL_SESSION')) {
        solicitarSync();
        registrarPush(false);
      }
      if (evento === 'SIGNED_OUT') queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Tocar una notificación abre la incidencia (RF-71). En arranque en frío se espera a que
  // el navegador esté montado: navegar antes lanza un error en Expo Router.
  const navegacionLista = navegacion?.key != null;
  useEffect(() => {
    const id = incidenciaDeNotificacion(respuesta?.notification.request.content.data);
    if (id === null || !navegacionLista) return;
    router.push({ pathname: '/ciudadano/incidencia/[id]', params: { id: String(id) } });
    Notifications.clearLastNotificationResponse();
  }, [respuesta, navegacionLista]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="index" options={{ title: 'ClearStreets' }} />
          <Stack.Screen name="operador/index" options={{ title: 'Operador' }} />
          <Stack.Screen name="operador/recorrido" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="operador/resumen" options={{ title: 'Resumen del recorrido', headerBackVisible: false }} />
          <Stack.Screen name="ciudadano/index" options={{ title: 'Incidencias cercanas' }} />
          <Stack.Screen name="ciudadano/incidencia/[id]" options={{ title: 'Incidencia' }} />
          <Stack.Screen name="ciudadano/cuenta" options={{ title: 'Mi cuenta' }} />
          <Stack.Screen name="ciudadano/seguimientos" options={{ title: 'Lo que sigo' }} />
          <Stack.Screen name="ciudadano/conduccion" options={{ title: 'Modo conducción' }} />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
