import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LatLng } from '@/domain/types';

import { RADIOS_M } from './api';
import { useSeguir } from './useSeguir';

/** Seguir la zona en el centro del mapa (RF-70). */
export function SeguirZonaBoton({ centro }: { centro: LatLng | null }) {
  const { seguirZona, ocupado } = useSeguir();
  const [abierto, setAbierto] = useState(false);
  const [hecho, setHecho] = useState<number | null>(null);

  const elegir = async (radio: number) => {
    if (!centro) return;
    const ok = await seguirZona(centro, radio);
    setAbierto(false);
    if (ok) {
      setHecho(radio);
      setTimeout(() => setHecho(null), 3000);
    }
  };

  if (hecho) {
    return (
      <View style={[styles.pastilla, styles.ok]} accessibilityLiveRegion="polite">
        <Text style={styles.textoClaro}>Siguiendo esta zona ({hecho} m)</Text>
      </View>
    );
  }

  if (!abierto) {
    return (
      <Pressable style={styles.pastilla} onPress={() => setAbierto(true)} disabled={!centro} accessibilityRole="button">
        <Text style={styles.texto}>＋ Seguir esta zona</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.selector}>
      <Text style={styles.pregunta}>Radio alrededor del centro del mapa</Text>
      <View style={styles.opciones}>
        {RADIOS_M.map((r) => (
          <Pressable key={r} style={styles.opcion} onPress={() => elegir(r)} disabled={ocupado} accessibilityRole="button">
            <Text style={styles.textoClaro}>{r} m</Text>
          </Pressable>
        ))}
        <Pressable style={[styles.opcion, styles.cancelar]} onPress={() => setAbierto(false)} accessibilityRole="button">
          <Text style={styles.texto}>Cancelar</Text>
        </Pressable>
      </View>
      {ocupado && <ActivityIndicator />}
    </View>
  );
}

const sombra = { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 3 };

const styles = StyleSheet.create({
  pastilla: { alignSelf: 'center', minHeight: 48, paddingHorizontal: 20, borderRadius: 24, backgroundColor: 'white', justifyContent: 'center', ...sombra },
  ok: { backgroundColor: '#0F766E' },
  texto: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  textoClaro: { fontSize: 16, fontWeight: '600', color: 'white' },
  selector: { backgroundColor: 'white', borderRadius: 16, padding: 14, gap: 10, ...sombra },
  pregunta: { fontWeight: '600', textAlign: 'center' },
  opciones: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  opcion: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#0F766E', justifyContent: 'center' },
  cancelar: { backgroundColor: '#F1F5F9' },
});
