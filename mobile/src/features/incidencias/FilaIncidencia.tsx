import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLOR_SEVERIDAD, ETIQUETA, type IncidenciaOrdenada } from './logica';

export function formatoDistancia(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function FilaIncidencia({ i, onPress }: { i: IncidenciaOrdenada; onPress: () => void }) {
  return (
    <Pressable style={styles.fila} onPress={onPress} accessibilityRole="button">
      <View style={[styles.marca, { backgroundColor: COLOR_SEVERIDAD[i.severidad] }]}>
        <Text style={styles.letra}>{i.clase === 'bache' ? 'B' : 'R'}</Text>
      </View>
      <View style={styles.cuerpo}>
        <Text style={styles.titulo}>
          {ETIQUETA.clase[i.clase]} · severidad {ETIQUETA.severidad[i.severidad].toLowerCase()}
        </Text>
        <Text style={styles.sub}>
          {ETIQUETA.estado[i.estado]}
          {i.alcaldia ? ` · ${i.alcaldia}` : ''}
          {i.frecuencia > 1 ? ` · visto ${i.frecuencia} veces` : ''}
        </Text>
      </View>
      {i.distanciaM !== undefined && <Text style={styles.distancia}>{formatoDistancia(i.distanciaM)}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: 'white', borderRadius: 14 },
  marca: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  letra: { color: 'white', fontWeight: '800' },
  cuerpo: { flex: 1, gap: 2 },
  titulo: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  sub: { color: '#64748B' },
  distancia: { color: '#0F172A', fontWeight: '600' },
});
