import { useNetworkState } from 'expo-network';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { solicitarSync, useSync } from './servicio';

/** Estado de la cola local y reintento manual (RF-43). */
export function EstadoSyncTarjeta() {
  const { conteo, sincronizando, ultimo, error } = useSync();
  const red = useNetworkState();
  const pendientes = conteo.detecciones + conteo.recorridos;

  let titulo: string;
  if (sincronizando) titulo = 'Sincronizando…';
  else if (pendientes === 0) titulo = 'Todo sincronizado';
  else titulo = `${conteo.detecciones} detecciones pendientes`;

  const detalle: string[] = [];
  if (red.isConnected === false) detalle.push('Sin conexión: se enviará al recuperar la red.');
  if (ultimo?.estado === 'sin_sesion') detalle.push('Inicia sesión para enviar.');
  if (conteo.enRevision > 0) detalle.push(`${conteo.enRevision} recorrido(s) esperando revisión.`);
  if (conteo.conError > 0) detalle.push(`${conteo.conError} con error: ${conteo.ultimoError}`);
  if (error) detalle.push(error);
  if (ultimo) detalle.push(`Último intento: ${new Date(ultimo.fecha).toLocaleTimeString('es-MX')}`);

  return (
    <View style={styles.tarjeta} accessibilityLiveRegion="polite">
      <View style={styles.fila}>
        {sincronizando && <ActivityIndicator />}
        <Text style={styles.titulo}>{titulo}</Text>
      </View>
      {detalle.map((d) => (
        <Text key={d} style={styles.detalle}>
          {d}
        </Text>
      ))}
      {pendientes > 0 && !sincronizando && (
        <Pressable style={styles.boton} onPress={() => solicitarSync(true)} accessibilityRole="button">
          <Text style={styles.textoBoton}>Reintentar ahora</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: { backgroundColor: '#F1F5F9', borderRadius: 16, padding: 16, gap: 6 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { fontSize: 18, fontWeight: '700' },
  detalle: { color: '#475569' },
  boton: { marginTop: 8, minHeight: 48, borderRadius: 12, backgroundColor: '#208AEF', alignItems: 'center', justifyContent: 'center' },
  textoBoton: { color: 'white', fontWeight: '600', fontSize: 16 },
});
