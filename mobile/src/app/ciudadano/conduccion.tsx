import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  detenerModoConduccion,
  iniciarModoConduccion,
  leerEstadoConduccion,
  modoConduccionActivo,
  type EstadoConduccion,
  type ResultadoInicio,
} from '@/features/alertas/tarea';

const MENSAJE: Partial<Record<ResultadoInicio, string>> = {
  sin_permiso_ubicacion: 'Se necesita el permiso de ubicación para avisarte.',
  sin_permiso_notificaciones: 'Se necesita el permiso de notificaciones para mostrar las alertas.',
  error: 'No se pudo iniciar el modo conducción.',
};

const hace = (t?: number) => {
  if (!t) return '—';
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`;
};

/** Activar/desactivar las alertas de proximidad (RF-80–83). */
export default function ModoConduccion() {
  const [activo, setActivo] = useState<boolean | null>(null);
  const [estado, setEstado] = useState<EstadoConduccion | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    const refrescar = async () => {
      setActivo(await modoConduccionActivo());
      setEstado(await leerEstadoConduccion());
    };
    refrescar();
    const t = setInterval(refrescar, 2000);
    return () => clearInterval(t);
  }, []);

  const alternar = async () => {
    setCambiando(true);
    setMensaje(null);
    if (activo) {
      await detenerModoConduccion();
      setActivo(false);
    } else {
      const r = await iniciarModoConduccion();
      setActivo(r === 'activo');
      setMensaje(MENSAJE[r] ?? null);
    }
    setCambiando(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.contenido}>
      <Text style={styles.texto}>
        Con el modo conducción activo, el teléfono suena y vibra al acercarte a menos de 150 m de un bache grave en tu
        dirección de avance, aunque la pantalla esté apagada.
      </Text>

      <Pressable
        style={[styles.boton, activo && styles.botonActivo]}
        onPress={alternar}
        disabled={cambiando || activo === null}
        accessibilityRole="switch"
        accessibilityState={{ checked: !!activo }}>
        {cambiando || activo === null ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.textoBoton}>{activo ? 'Detener modo conducción' : 'Activar modo conducción'}</Text>
        )}
      </Pressable>

      {mensaje && (
        <View style={styles.aviso}>
          <Text style={styles.textoAviso}>{mensaje}</Text>
          <Pressable onPress={() => Linking.openSettings()} accessibilityRole="link">
            <Text style={styles.enlace}>Abrir ajustes</Text>
          </Pressable>
        </View>
      )}

      {activo && (
        <View style={styles.tarjeta}>
          <Fila etiqueta="Última ubicación" valor={hace(estado?.ultimaPosicion)} />
          <Fila etiqueta="Baches graves en 5 km" valor={String(estado?.enCache ?? 0)} />
          <Fila etiqueta="Datos actualizados" valor={hace(estado?.cacheFecha)} />
          <Fila
            etiqueta="Última alerta"
            valor={estado?.ultimaAlerta ? `${Math.round(estado.ultimaAlerta.distanciaM)} m · ${hace(estado.ultimaAlerta.fecha)}` : '—'}
          />
          {estado?.error && <Text style={styles.textoAviso}>Sin conexión: usando datos guardados.</Text>}
        </View>
      )}

      <Text style={styles.nota}>
        Mantén el teléfono en un soporte y no lo manipules mientras conduces. Las alertas solo cubren baches ya detectados.
      </Text>
    </ScrollView>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={styles.fila}>
      <Text style={styles.tenue}>{etiqueta}</Text>
      <Text style={styles.valor}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: 20, gap: 16 },
  texto: { fontSize: 16, color: '#334155', lineHeight: 22 },
  boton: { minHeight: 72, borderRadius: 16, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' },
  botonActivo: { backgroundColor: '#B91C1C' },
  textoBoton: { color: 'white', fontSize: 19, fontWeight: '700' },
  aviso: { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, gap: 6 },
  textoAviso: { color: '#92400E' },
  enlace: { color: '#0F766E', fontWeight: '600' },
  tarjeta: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, gap: 10 },
  fila: { flexDirection: 'row', justifyContent: 'space-between' },
  tenue: { color: '#64748B' },
  valor: { fontWeight: '600' },
  nota: { color: '#64748B', fontSize: 13 },
});
