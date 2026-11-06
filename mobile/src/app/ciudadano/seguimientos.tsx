import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { ETIQUETA } from '@/features/incidencias/logica';
import { useDejarDeSeguir, useSeguimientos, type Seguimiento } from '@/features/seguimiento/api';
import { useSesion } from '@/features/sesion/useSesion';

/** Zonas e incidencias seguidas (RF-70, RF-72). */
export default function MisSeguimientos() {
  const sesion = useSesion();
  const q = useSeguimientos(sesion.estado === 'activa');
  const quitar = useDejarDeSeguir();

  if (sesion.estado !== 'activa') {
    return <Text style={styles.vacio}>Inicia sesión en «Mi cuenta» para seguir zonas e incidencias.</Text>;
  }
  if (q.isPending) return <ActivityIndicator style={{ flex: 1 }} />;
  if (q.error) return <Text style={styles.vacio}>{q.error.message}</Text>;

  return (
    <FlatList
      contentContainerStyle={styles.lista}
      data={q.data}
      keyExtractor={(s) => String(s.id)}
      renderItem={({ item }) => <Fila s={item} onQuitar={() => quitar.mutate(item.id)} quitando={quitar.isPending && quitar.variables === item.id} />}
      ListEmptyComponent={
        <Text style={styles.vacio}>
          Aún no sigues nada. En el mapa usa «Seguir esta zona», o abre una incidencia y pulsa «Seguir».
        </Text>
      }
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
    />
  );
}

function Fila({ s, onQuitar, quitando }: { s: Seguimiento; onQuitar: () => void; quitando: boolean }) {
  const titulo =
    s.tipo === 'zona'
      ? `Zona de ${s.radio_m} m${s.alcaldia ? ` · ${s.alcaldia}` : ''}`
      : `${s.clase ? ETIQUETA.clase[s.clase] : 'Incidencia'} #${s.incidencia_id}`;
  const sub =
    s.tipo === 'zona'
      ? `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`
      : `${s.estado ? ETIQUETA.estado[s.estado] : ''}${s.alcaldia ? ` · ${s.alcaldia}` : ''}`;

  return (
    <View style={styles.fila}>
      <Pressable
        style={{ flex: 1 }}
        disabled={s.tipo !== 'incidencia'}
        onPress={() => router.push({ pathname: '/ciudadano/incidencia/[id]', params: { id: String(s.incidencia_id) } })}
        accessibilityRole={s.tipo === 'incidencia' ? 'button' : undefined}>
        <Text style={styles.titulo}>{titulo}</Text>
        <Text style={styles.tenue}>{sub}</Text>
      </Pressable>
      <Pressable onPress={onQuitar} disabled={quitando} style={styles.quitar} accessibilityRole="button" accessibilityLabel={`Dejar de seguir ${titulo}`}>
        {quitando ? <ActivityIndicator /> : <Text style={styles.textoQuitar}>Dejar de seguir</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  lista: { padding: 16, gap: 10 },
  vacio: { textAlign: 'center', color: '#64748B', margin: 32 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: '#F8FAFC' },
  titulo: { fontSize: 16, fontWeight: '600' },
  tenue: { color: '#64748B' },
  quitar: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FEE2E2', justifyContent: 'center' },
  textoQuitar: { color: '#B91C1C', fontWeight: '600' },
});
