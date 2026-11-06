import { useBatteryLevel } from 'expo-battery';
import { randomUUID } from 'expo-crypto';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraPermission } from 'react-native-vision-camera';

import { useDetector, type DeteccionFotograma } from '@/features/deteccion/useDetector';
import { CajasOverlay } from '@/features/recorrido/CajasOverlay';
import { resumir, useRecorrido } from '@/features/recorrido/store';
import { useRegistro } from '@/features/recorrido/useRegistro';
import { useUbicacion } from '@/features/recorrido/useUbicacion';

/** Recorrido en vivo (RF-10–21). */
export default function RecorridoEnVivo() {
  useKeepAwake();
  const camara = useCameraPermission();
  const iniciar = useRecorrido((s) => s.iniciar);
  const finalizar = useRecorrido((s) => s.finalizar);
  const recorrido = useRecorrido((s) => s.recorrido);
  const detecciones = useRecorrido((s) => s.detecciones);
  const punto = useRecorrido((s) => s.ultimoPunto);
  const bateria = useBatteryLevel();
  const [cajas, setCajas] = useState<DeteccionFotograma[]>([]);

  // Un solo recorrido por montaje (StrictMode ejecuta los efectos dos veces en desarrollo).
  const iniciado = useRef(false);
  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    iniciar(randomUUID(), Date.now());
  }, [iniciar]);

  const { hasPermission, canRequestPermission, requestPermission } = camara;
  useEffect(() => {
    if (!hasPermission && canRequestPermission) requestPermission();
  }, [hasPermission, canRequestPermission, requestPermission]);

  const activo = recorrido != null && recorrido.fin === undefined;
  const gps = useUbicacion(activo);
  const registro = useRegistro(gps.detenido);
  const { alProcesarFotograma } = registro;

  const onDetecciones = useCallback(
    (d: DeteccionFotograma[], t: number) => {
      setCajas(d);
      alProcesarFotograma(d, t);
    },
    [alProcesarFotograma],
  );
  const detector = useDetector(onDetecciones);

  const terminar = useCallback(() => {
    finalizar(Date.now());
    router.replace('/operador/resumen');
  }, [finalizar]);

  // El botón «atrás» de Android también finaliza: si no, el recorrido quedaría abierto sin revisión.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      terminar();
      return true;
    });
    return () => sub.remove();
  }, [terminar]);

  if (!camara.hasPermission) {
    return (
      <SafeAreaView style={styles.centro}>
        <Text style={styles.textoClaro}>ClearStreets necesita la cámara para detectar baches y basura.</Text>
        <Pressable style={styles.boton} onPress={camara.requestPermission} accessibilityRole="button">
          <Text style={styles.textoBoton}>Permitir cámara</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const resumen = resumir(detecciones);
  const avisos = avisosDe({
    gps: gps.estado,
    precision: punto?.precisionM,
    estadoModelos: detector.estadoModelos.estado,
    faltantes: detector.estadoModelos.estado === 'listo' ? detector.estadoModelos.faltantes : [],
    errorResizer: detector.errorResizer,
    bateria,
  });

  return (
    <View style={styles.fondo}>
      <Camera style={StyleSheet.absoluteFill} device="back" isActive={activo} outputs={[detector.frameOutput]} resizeMode="cover" />
      <CajasOverlay detecciones={cajas} />

      <SafeAreaView style={styles.capa} edges={['top', 'bottom']}>
        <View style={styles.barra}>
          <Text style={styles.contador} accessibilityLabel={`${resumen.total} detecciones`}>
            {resumen.total}
          </Text>
          <View style={styles.estado}>
            <Text style={styles.textoClaro}>
              {(recorrido?.distanciaM ?? 0) >= 1000
                ? `${((recorrido?.distanciaM ?? 0) / 1000).toFixed(1)} km`
                : `${Math.round(recorrido?.distanciaM ?? 0)} m`}
              {'  ·  '}
              {resumen.porClase.bache} baches · {resumen.porClase.basura} basura
            </Text>
            <Text style={styles.textoTenue}>
              GPS {punto ? `±${Math.round(punto.precisionM)} m` : '—'}
              {detector.msPorFotograma > 0 ? `  ·  ${Math.round(1000 / detector.msPorFotograma)} FPS` : ''}
            </Text>
          </View>
        </View>

        {avisos.map((a) => (
          <Text key={a} style={styles.aviso}>
            {a}
          </Text>
        ))}

        <View style={styles.acciones}>
          <Pressable
            style={[styles.boton, styles.botonManual]}
            onPress={registro.registrarManual}
            accessibilityRole="button"
            accessibilityLabel="Registrar incidencia manualmente">
            <Text style={styles.textoBoton}>Registrar aquí</Text>
          </Pressable>
          <Pressable style={[styles.boton, styles.botonFin]} onPress={terminar} accessibilityRole="button">
            <Text style={styles.textoBoton}>Finalizar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function avisosDe(e: {
  gps: string;
  precision?: number;
  estadoModelos: string;
  faltantes: string[];
  errorResizer?: string;
  bateria: number;
}): string[] {
  const a: string[] = [];
  if (e.gps === 'denegada') a.push('Sin permiso de ubicación: no se registrarán detecciones.');
  else if (e.gps === 'error') a.push('Error de GPS.');
  else if (e.precision !== undefined && e.precision > 20) a.push('Señal GPS débil (> 20 m): detecciones en pausa.');
  if (e.estadoModelos === 'cargando') a.push('Cargando modelos…');
  if (e.estadoModelos === 'error') a.push('No se pudieron cargar los modelos.');
  if (e.faltantes.length) a.push(`Modelos no instalados: ${e.faltantes.join(', ')}. Solo registro manual.`);
  if (e.errorResizer) a.push(`Error de cámara: ${e.errorResizer}`);
  if (e.bateria >= 0 && e.bateria < 0.15) a.push('Batería baja: conecta el cargador.');
  return a;
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'black' },
  capa: { flex: 1, justifyContent: 'space-between', padding: 16 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 16, padding: 12 },
  contador: { color: 'white', fontSize: 40, fontWeight: '800', minWidth: 56, textAlign: 'center' },
  estado: { flex: 1, gap: 2 },
  aviso: { color: 'white', backgroundColor: 'rgba(180,83,9,0.9)', borderRadius: 10, padding: 10, marginTop: 8, fontSize: 15 },
  acciones: { flexDirection: 'row', gap: 12, marginTop: 'auto' },
  boton: { minHeight: 72, borderRadius: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, backgroundColor: '#208AEF' },
  botonManual: { flex: 2, backgroundColor: '#EA580C' },
  botonFin: { flex: 1, backgroundColor: 'rgba(30,30,30,0.85)' },
  textoBoton: { color: 'white', fontSize: 20, fontWeight: '700' },
  textoClaro: { color: 'white', fontSize: 16 },
  textoTenue: { color: '#D4D4D4', fontSize: 13 },
  centro: { flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: 'black' },
});
