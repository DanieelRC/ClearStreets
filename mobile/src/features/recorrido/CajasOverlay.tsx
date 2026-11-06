import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import type { DeteccionFotograma } from '@/features/deteccion/useDetector';

/** Relación ancho/alto del fotograma vertical que entrega la cámara (HD 9:16). */
const ASPECTO_FOTOGRAMA = 9 / 16;

const COLOR = { bache: '#F97316', basura: '#A855F7' } as const;

/** Dibuja las cajas sobre la vista previa (que usa resizeMode "cover"). */
export function CajasOverlay({ detecciones }: { detecciones: DeteccionFotograma[] }) {
  const [tam, setTam] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) =>
    setTam({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  // Escala "cover": el fotograma llena la vista y se recorta en un eje.
  const escala = Math.max(tam.w / ASPECTO_FOTOGRAMA, tam.h);
  const fw = escala * ASPECTO_FOTOGRAMA;
  const fh = escala;
  const ox = (tam.w - fw) / 2;
  const oy = (tam.h - fh) / 2;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {tam.w > 0 &&
        detecciones.map((d, i) => (
          <View
            key={i}
            style={[
              styles.caja,
              {
                borderColor: COLOR[d.clase],
                left: ox + (d.box.x - d.box.w / 2) * fw,
                top: oy + (d.box.y - d.box.h / 2) * fh,
                width: d.box.w * fw,
                height: d.box.h * fh,
              },
            ]}>
            <Text style={[styles.etiqueta, { backgroundColor: COLOR[d.clase] }]}>
              {d.clase} {Math.round(d.confianza * 100)}%
            </Text>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { position: 'absolute', borderWidth: 3, borderRadius: 6 },
  etiqueta: { position: 'absolute', top: -22, left: -3, color: 'white', fontSize: 12, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
});
