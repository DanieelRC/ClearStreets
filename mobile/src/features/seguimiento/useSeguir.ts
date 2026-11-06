import { router } from 'expo-router';
import { Alert } from 'react-native';

import type { LatLng } from '@/domain/types';
import { registrarPush } from '@/features/push/registro';
import { useSesion } from '@/features/sesion/useSesion';

import { useDejarDeSeguir, useSeguimientos, useSeguirIncidencia, useSeguirZona } from './api';

/**
 * Acciones de seguimiento con los requisitos previos resueltos:
 * sin sesión → pantalla de cuenta; con sesión → pide permiso de notificaciones (RF-05) y sigue.
 */
export function useSeguir() {
  const sesion = useSesion();
  const usuarioId = sesion.estado === 'activa' ? sesion.session.user.id : null;
  const lista = useSeguimientos(usuarioId !== null);
  const zona = useSeguirZona();
  const incidencia = useSeguirIncidencia();
  const dejar = useDejarDeSeguir();

  const requerirSesion = () => {
    if (usuarioId) return true;
    router.push('/ciudadano/cuenta');
    return false;
  };

  const reportar = (e: unknown) => Alert.alert('No se pudo completar', e instanceof Error ? e.message : String(e));

  return {
    seguirZona: async (centro: LatLng, radio: number) => {
      if (!requerirSesion()) return false;
      await registrarPush(true);
      try {
        await zona.mutateAsync({ centro, radio });
        return true;
      } catch (e) {
        reportar(e);
        return false;
      }
    },
    seguimientoDeIncidencia: (id: number) => lista.data?.find((s) => s.incidencia_id === id) ?? null,
    alternarIncidencia: async (id: number) => {
      if (!requerirSesion()) return;
      const actual = lista.data?.find((s) => s.incidencia_id === id);
      try {
        if (actual) await dejar.mutateAsync(actual.id);
        else {
          await registrarPush(true);
          await incidencia.mutateAsync({ incidenciaId: id, usuarioId: usuarioId! });
        }
      } catch (e) {
        reportar(e);
      }
    },
    ocupado: zona.isPending || incidencia.isPending || dejar.isPending,
  };
}
