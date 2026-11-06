import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { registrarPush, type ResultadoRegistroPush } from '@/features/push/registro';
import { useNotificaciones } from '@/features/seguimiento/api';
import { FormularioAcceso } from '@/features/sesion/FormularioAcceso';
import { cerrarSesion, eliminarCuenta, useSesion } from '@/features/sesion/useSesion';

const AVISO_PUSH: Partial<Record<ResultadoRegistroPush, string>> = {
  sin_permiso: 'Activa las notificaciones de ClearStreets en los ajustes de Android.',
  sin_project_id: 'Notificaciones no disponibles en esta compilación (falta el projectId de EAS).',
  error: 'No se pudo registrar este teléfono para notificaciones.',
};

/** Cuenta del ciudadano: acceso, notificaciones y eliminación (RF-03, RF-72). */
export default function Cuenta() {
  const sesion = useSesion();
  const usuarioId = sesion.estado === 'activa' ? sesion.session.user.id : null;
  const notif = useNotificaciones(usuarioId);
  const [avisoPush, setAvisoPush] = useState<string | null>(null);

  if (sesion.estado === 'cargando') return <ActivityIndicator style={{ flex: 1 }} />;
  if (sesion.estado === 'sin_backend') return <Text style={styles.centro}>Backend no configurado (.env.local).</Text>;
  if (sesion.estado === 'anonimo') {
    return (
      <FormularioAcceso
        titulo="Inicia sesión"
        descripcion="Con una cuenta puedes seguir calles e incidencias y recibir avisos cuando cambien. Consultar el mapa no la requiere."
        permitirRegistro
      />
    );
  }

  const alternar = async (activas: boolean) => {
    setAvisoPush(null);
    if (activas) {
      const r = await registrarPush(true);
      setAvisoPush(AVISO_PUSH[r] ?? null);
    }
    notif.cambiar.mutate(activas);
  };

  const confirmarEliminar = () =>
    Alert.alert(
      '¿Eliminar tu cuenta?',
      'Se borrarán tu cuenta, tus seguimientos y los avisos. Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const e = await eliminarCuenta();
            if (e) Alert.alert('Error', e);
          },
        },
      ],
    );

  return (
    <ScrollView contentContainerStyle={styles.contenido}>
      <Text style={styles.correo}>{sesion.session.user.email}</Text>

      <View style={styles.tarjeta}>
        <View style={styles.fila}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>Notificaciones</Text>
            <Text style={styles.tenue}>Cambios de estado y nuevos baches graves en lo que sigues.</Text>
          </View>
          {notif.cargando ? (
            <ActivityIndicator />
          ) : (
            <Switch value={notif.activas ?? false} onValueChange={alternar} accessibilityLabel="Notificaciones" />
          )}
        </View>
        {avisoPush && <Text style={styles.aviso}>{avisoPush}</Text>}
      </View>

      <Link href="/ciudadano/seguimientos" asChild>
        <Pressable style={styles.tarjeta} accessibilityRole="button">
          <Text style={styles.titulo}>Lo que sigo  ›</Text>
          <Text style={styles.tenue}>Zonas e incidencias que sigues.</Text>
        </Pressable>
      </Link>

      <Pressable style={styles.secundario} onPress={cerrarSesion} accessibilityRole="button">
        <Text style={styles.textoSecundario}>Cerrar sesión</Text>
      </Pressable>
      <Pressable style={styles.peligro} onPress={confirmarEliminar} accessibilityRole="button">
        <Text style={styles.textoPeligro}>Eliminar mi cuenta</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centro: { margin: 24, textAlign: 'center' },
  contenido: { padding: 16, gap: 12 },
  correo: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  tarjeta: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, gap: 6 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { fontSize: 16, fontWeight: '600' },
  tenue: { color: '#64748B' },
  aviso: { color: '#92400E' },
  secundario: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  textoSecundario: { fontSize: 16, fontWeight: '600' },
  peligro: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  textoPeligro: { color: '#B91C1C', fontSize: 16, fontWeight: '600' },
});
