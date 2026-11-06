import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Clase, Estado, LatLng, Severidad } from '@/domain/types';
import { supabase } from '@/lib/supabase';

export const RADIOS_M = [100, 250, 500] as const;

export interface Seguimiento {
  id: number;
  tipo: 'zona' | 'incidencia';
  lat: number;
  lng: number;
  radio_m: number | null;
  incidencia_id: number | null;
  clase: Clase | null;
  severidad: Severidad | null;
  estado: Estado | null;
  alcaldia: string | null;
}

function cliente() {
  if (!supabase) throw new Error('Backend no configurado (.env.local).');
  return supabase;
}

const CLAVE = ['seguimientos'];

/** Seguimientos del usuario (RF-70, RF-72). `habilitado` = hay sesión. */
export function useSeguimientos(habilitado: boolean) {
  return useQuery({
    queryKey: CLAVE,
    enabled: habilitado,
    queryFn: async (): Promise<Seguimiento[]> => {
      const { data, error } = await cliente().rpc('mis_seguimientos');
      if (error) throw new Error(error.message);
      return data as Seguimiento[];
    },
  });
}

export function useSeguirZona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ centro, radio }: { centro: LatLng; radio: number }) => {
      const { error } = await cliente().rpc('seguir_zona', { p_lat: centro.lat, p_lng: centro.lng, p_radio_m: radio });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useSeguirIncidencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ incidenciaId, usuarioId }: { incidenciaId: number; usuarioId: string }) => {
      const { error } = await cliente()
        .from('seguimientos')
        .upsert({ usuario_id: usuarioId, incidencia_id: incidenciaId }, { onConflict: 'usuario_id,incidencia_id', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useDejarDeSeguir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await cliente().from('seguimientos').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

/** Preferencia global de notificaciones (RF-72). */
export function useNotificaciones(usuarioId: string | null) {
  const qc = useQueryClient();
  const clave = ['perfil', usuarioId];
  const consulta = useQuery({
    queryKey: clave,
    enabled: usuarioId !== null,
    queryFn: async () => {
      const { data, error } = await cliente().from('perfiles').select('notificaciones').eq('id', usuarioId!).single();
      if (error) throw new Error(error.message);
      return data.notificaciones as boolean;
    },
  });
  const cambiar = useMutation({
    mutationFn: async (activas: boolean) => {
      const { error } = await cliente().from('perfiles').update({ notificaciones: activas }).eq('id', usuarioId!);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clave }),
  });
  return { activas: consulta.data, cargando: consulta.isPending, cambiar };
}
