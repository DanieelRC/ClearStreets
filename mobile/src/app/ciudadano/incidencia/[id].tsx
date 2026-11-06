import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Estado } from '@/domain/types';
import { useIncidencia } from '@/features/incidencias/api';
import { COLOR_SEVERIDAD, ETIQUETA } from '@/features/incidencias/logica';
import { useSeguir } from '@/features/seguimiento/useSeguir';

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const PASOS: Estado[] = ['pendiente', 'en_proceso', 'resuelto'];

/** Detalle de incidencia con historial de estados (RF-62). */
export default function DetalleIncidencia() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useIncidencia(Number(id));
  const seguir = useSeguir();

  if (q.isPending) return <ActivityIndicator style={{ flex: 1 }} />;
  if (q.error) return <Text style={styles.error}>{q.error.message}</Text>;

  const d = q.data;
  const paso = PASOS.indexOf(d.estado);
  const siguiendo = seguir.seguimientoDeIncidencia(d.id) !== null;

  return (
    <ScrollView contentContainerStyle={styles.contenido}>
      <Stack.Screen options={{ title: `${ETIQUETA.clase[d.clase]} #${d.id}` }} />

      <View style={styles.cabecera}>
        <View style={[styles.insignia, { backgroundColor: COLOR_SEVERIDAD[d.severidad] }]}>
          <Text style={styles.insigniaTexto}>Severidad {ETIQUETA.severidad[d.severidad].toLowerCase()}</Text>
        </View>
        <Text style={styles.alcaldia}>{d.alcaldia?.nombre ?? 'Alcaldía sin asignar'}</Text>
      </View>

      <View style={styles.progreso} accessibilityLabel={`Estado: ${ETIQUETA.estado[d.estado]}`}>
        {PASOS.map((p, i) => (
          <View key={p} style={styles.paso}>
            <View style={[styles.barraPaso, i <= paso && styles.barraActiva]} />
            <Text style={[styles.textoPaso, i === paso && styles.textoPasoActivo]}>{ETIQUETA.estado[p]}</Text>
          </View>
        ))}
      </View>

      {d.estado !== 'resuelto' && (
        <Pressable
          style={[styles.seguir, siguiendo && styles.siguiendo]}
          onPress={() => seguir.alternarIncidencia(d.id)}
          disabled={seguir.ocupado}
          accessibilityRole="button"
          accessibilityState={{ selected: siguiendo }}>
          {seguir.ocupado ? (
            <ActivityIndicator color={siguiendo ? '#0F766E' : 'white'} />
          ) : (
            <Text style={[styles.textoSeguir, siguiendo && styles.textoSiguiendo]}>
              {siguiendo ? '✓ Siguiendo · dejar de seguir' : 'Seguir y recibir avisos'}
            </Text>
          )}
        </Pressable>
      )}

      <View style={styles.tarjeta}>
        <Dato etiqueta="Detectado por primera vez" valor={fecha(d.primera_deteccion)} />
        <Dato etiqueta="Última detección" valor={fecha(d.ultima_deteccion)} />
        <Dato etiqueta="Veces detectado" valor={String(d.frecuencia)} />
        <Dato etiqueta="Prioridad de atención" valor={`${Math.round(d.prioridad)} / 100`} />
        {d.resuelta_en && <Dato etiqueta="Resuelto" valor={fecha(d.resuelta_en)} />}
      </View>

      <Text style={styles.seccion}>Historial</Text>
      {d.historial.length === 0 ? (
        <Text style={styles.tenue}>Aún sin cambios de estado. La alcaldía fue notificada al detectarse.</Text>
      ) : (
        d.historial.map((h) => (
          <View key={h.fecha} style={styles.evento}>
            <Text style={styles.eventoTitulo}>
              {h.estado_anterior ? `${ETIQUETA.estado[h.estado_anterior]} → ` : ''}
              {ETIQUETA.estado[h.estado_nuevo]}
            </Text>
            <Text style={styles.tenue}>{fecha(h.fecha)}</Text>
            {h.nota && <Text>{h.nota}</Text>}
          </View>
        ))
      )}
      {/* Pendiente: miniaturas anonimizadas cuando se suba evidencia (RF-30, RF-62). */}
    </ScrollView>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={styles.dato}>
      <Text style={styles.tenue}>{etiqueta}</Text>
      <Text style={styles.valor}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 16 },
  error: { margin: 24, color: '#B91C1C', textAlign: 'center' },
  cabecera: { gap: 8 },
  insignia: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  insigniaTexto: { color: 'white', fontWeight: '700' },
  alcaldia: { fontSize: 20, fontWeight: '700' },
  progreso: { flexDirection: 'row', gap: 6 },
  paso: { flex: 1, gap: 6 },
  barraPaso: { height: 6, borderRadius: 3, backgroundColor: '#E2E8F0' },
  barraActiva: { backgroundColor: '#0F766E' },
  textoPaso: { color: '#94A3B8', fontSize: 13 },
  textoPasoActivo: { color: '#0F172A', fontWeight: '700' },
  seguir: { minHeight: 56, borderRadius: 14, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' },
  siguiendo: { backgroundColor: 'white', borderWidth: 1, borderColor: '#0F766E' },
  textoSeguir: { color: 'white', fontSize: 16, fontWeight: '700' },
  textoSiguiendo: { color: '#0F766E' },
  tarjeta: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, gap: 12 },
  dato: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  valor: { fontWeight: '600', color: '#0F172A' },
  seccion: { fontSize: 18, fontWeight: '700' },
  tenue: { color: '#64748B' },
  evento: { borderLeftWidth: 3, borderLeftColor: '#0F766E', paddingLeft: 12, gap: 2 },
  eventoTitulo: { fontWeight: '600' },
});
