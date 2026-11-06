import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { FormularioAcceso } from '@/features/sesion/FormularioAcceso';
import { cerrarSesion, useSesion } from '@/features/sesion/useSesion';
import { EstadoSyncTarjeta } from '@/features/sync/EstadoSyncTarjeta';
import { useSync } from '@/features/sync/servicio';

/** Inicio del operador: sesión por invitación (RF-01) y estado de la cola (RF-43). */
export default function InicioOperador() {
  const sesion = useSesion();
  const baseLista = useSync((s) => s.listo);

  if (sesion.estado === 'cargando') return <ActivityIndicator style={{ flex: 1 }} />;
  if (sesion.estado === 'anonimo') {
    return (
      <FormularioAcceso
        titulo="Acceso de operadores"
        descripcion="Usa la cuenta que te envió tu alcaldía."
        permitirRegistro={false}
        color="#EA580C"
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {sesion.estado === 'sin_backend' && (
        <Text style={styles.aviso}>Backend no configurado (.env.local): los recorridos se guardan solo en el teléfono.</Text>
      )}
      <Text style={styles.texto}>Monta el teléfono en el parabrisas con la cámara hacia el camino y conéctalo al cargador.</Text>
      {/* Sin la base local abierta, lo detectado no se guardaría (RF-40). */}
      <Link href="/operador/recorrido" asChild disabled={!baseLista}>
        <Pressable style={[styles.boton, !baseLista && { opacity: 0.5 }]} accessibilityRole="button" accessibilityState={{ disabled: !baseLista }}>
          {baseLista ? <Text style={styles.textoBoton}>Iniciar recorrido</Text> : <ActivityIndicator color="white" />}
        </Pressable>
      </Link>
      <EstadoSyncTarjeta />
      {sesion.estado === 'activa' && (
        <Pressable onPress={cerrarSesion} accessibilityRole="button" style={styles.salir}>
          <Text style={styles.textoSalir}>Cerrar sesión ({sesion.session.user.email})</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 20 },
  texto: { fontSize: 17, textAlign: 'center', color: '#475569' },
  aviso: { backgroundColor: '#FEF3C7', color: '#92400E', padding: 12, borderRadius: 12 },
  boton: { minHeight: 72, borderRadius: 16, backgroundColor: '#EA580C', justifyContent: 'center', alignItems: 'center' },
  textoBoton: { color: 'white', fontSize: 20, fontWeight: '700' },
  salir: { alignItems: 'center', padding: 12 },
  textoSalir: { color: '#64748B' },
});
