import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type EstadoSesion =
  | { estado: 'sin_backend' }
  | { estado: 'cargando' }
  | { estado: 'anonimo' }
  | { estado: 'activa'; session: Session };

/** Sesión actual de Supabase. Los efectos al iniciar sesión viven en el layout raíz. */
export function useSesion(): EstadoSesion {
  const [s, setS] = useState<EstadoSesion>(supabase ? { estado: 'cargando' } : { estado: 'sin_backend' });

  useEffect(() => {
    if (!supabase) return;
    const aplicar = (session: Session | null) =>
      setS(session ? { estado: 'activa', session } : { estado: 'anonimo' });
    supabase.auth.getSession().then(({ data }) => aplicar(data.session));
    const { data } = supabase.auth.onAuthStateChange((_evento, session) => aplicar(session));
    return () => data.subscription.unsubscribe();
  }, []);

  return s;
}

export async function iniciarSesion(correo: string, contrasena: string): Promise<string | null> {
  if (!supabase) return 'Backend no configurado.';
  const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: contrasena });
  return error ? 'Correo o contraseña incorrectos.' : null;
}

/** Registro de ciudadanos (RF-03). Devuelve un mensaje para mostrar, o null si ya quedó la sesión iniciada. */
export async function registrarse(correo: string, contrasena: string): Promise<{ error?: string; aviso?: string } | null> {
  if (!supabase) return { error: 'Backend no configurado.' };
  if (contrasena.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };
  const { data, error } = await supabase.auth.signUp({ email: correo.trim(), password: contrasena });
  if (error) return { error: error.message };
  if (!data.session) return { aviso: 'Te enviamos un correo para confirmar tu cuenta.' };
  return null;
}

export async function cerrarSesion() {
  await supabase?.auth.signOut();
}

/** Elimina la cuenta propia vía la Edge Function `eliminar-cuenta` (RF-03). */
export async function eliminarCuenta(): Promise<string | null> {
  if (!supabase) return 'Backend no configurado.';
  const { error } = await supabase.functions.invoke('eliminar-cuenta', { method: 'POST' });
  if (error) return 'No se pudo eliminar la cuenta. Intenta de nuevo.';
  await supabase.auth.signOut({ scope: 'local' });
  return null;
}
