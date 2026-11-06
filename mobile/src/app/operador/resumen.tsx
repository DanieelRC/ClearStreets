import { router } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { resumir, useRecorrido, type DeteccionRegistrada } from '@/features/recorrido/store';

/** Resumen y revisión del recorrido (RF-19, RF-20). */
export default function ResumenRecorrido() {
  const recorrido = useRecorrido((s) => s.recorrido);
  const detecciones = useRecorrido((s) => s.detecciones);
  const descartar = useRecorrido((s) => s.descartar);
  const confirmar = useRecorrido((s) => s.confirmar);

  // Salir de la revisión (botón o «atrás») la confirma; si no, quedaría en revisión hasta reiniciar la app.
  useEffect(() => confirmar, [confirmar]);

  if (!recorrido) {
    return (
      <View style={styles.centro}>
        <Text>No hay un recorrido reciente.</Text>
      </View>
    );
  }

  const r = resumir(detecciones);
  const minutos = Math.round(((recorrido.fin ?? recorrido.inicio) - recorrido.inicio) / 60000);

  return (
    <FlatList
      contentContainerStyle={styles.lista}
      data={detecciones}
      keyExtractor={(d) => d.id}
      ListHeaderComponent={
        <View style={styles.cabecera}>
          <View style={styles.cifras}>
            <Cifra valor={`${(recorrido.distanciaM / 1000).toFixed(1)} km`} etiqueta="distancia" />
            <Cifra valor={`${minutos} min`} etiqueta="duración" />
            <Cifra valor={String(r.total)} etiqueta="detecciones" />
          </View>
          <Text style={styles.detalle}>
            {r.porClase.bache} baches · {r.porClase.basura} basura — alta {r.porSeveridad.alta}, media{' '}
            {r.porSeveridad.media}, baja {r.porSeveridad.baja}
          </Text>
          <Text style={styles.nota}>
            Descarta las detecciones erróneas y pulsa «Enviar» para subir {r.total} a la cola de sincronización.
          </Text>
        </View>
      }
      renderItem={({ item }) => <Fila d={item} onDescartar={() => descartar(item.id)} />}
      ListEmptyComponent={<Text style={styles.nota}>No hubo detecciones en este recorrido.</Text>}
      ListFooterComponent={
        <Pressable
          style={styles.boton}
          onPress={() => router.replace('/operador')}
          accessibilityRole="button">
          <Text style={styles.textoBoton}>Enviar</Text>
        </Pressable>
      }
    />
  );
}

function Cifra({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <View style={styles.cifra}>
      <Text style={styles.valor}>{valor}</Text>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
    </View>
  );
}

function Fila({ d, onDescartar }: { d: DeteccionRegistrada; onDescartar: () => void }) {
  const hora = new Date(d.capturadaEn).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <View style={[styles.fila, d.descartada && styles.descartada]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.filaTitulo}>
          {d.clase === 'bache' ? 'Bache' : 'Basura'} · {d.severidad}
          {d.origen === 'manual' ? ' · manual' : ''}
        </Text>
        <Text style={styles.filaSub}>
          {hora} · {Math.round(d.confianza * 100)}% · ±{Math.round(d.precisionM)} m
        </Text>
      </View>
      {!d.descartada && (
        <Pressable onPress={onDescartar} style={styles.descartar} accessibilityRole="button" accessibilityLabel="Descartar detección">
          <Text style={styles.descartarTexto}>Descartar</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lista: { padding: 16, gap: 8 },
  cabecera: { gap: 8, marginBottom: 8 },
  cifras: { flexDirection: 'row', gap: 8 },
  cifra: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 12, padding: 12, alignItems: 'center' },
  valor: { fontSize: 22, fontWeight: '700' },
  etiqueta: { color: '#64748B' },
  detalle: { fontSize: 15 },
  nota: { color: '#64748B' },
  fila: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: '#F8FAFC', gap: 12 },
  descartada: { opacity: 0.4 },
  filaTitulo: { fontSize: 16, fontWeight: '600' },
  filaSub: { color: '#64748B' },
  descartar: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#FEE2E2' },
  descartarTexto: { color: '#B91C1C', fontWeight: '600' },
  boton: { minHeight: 64, borderRadius: 12, backgroundColor: '#208AEF', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  textoBoton: { color: 'white', fontSize: 18, fontWeight: '600' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
