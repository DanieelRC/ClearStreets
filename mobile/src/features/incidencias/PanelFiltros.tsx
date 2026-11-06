import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Clase, Estado, Severidad } from '@/domain/types';

import { COLOR_SEVERIDAD, ETIQUETA, FILTROS_INICIALES, type Filtros } from './logica';

interface Props {
  visible: boolean;
  filtros: Filtros;
  alcaldias: string[];
  onCambiar: (f: Filtros) => void;
  onCerrar: () => void;
}

const alternar = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

/** Filtros por clase, severidad, estado y alcaldía (RF-61). */
export function PanelFiltros({ visible, filtros, alcaldias, onCambiar, onCerrar }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar} accessibilityLabel="Cerrar filtros" />
      <View style={styles.hoja}>
        <ScrollView contentContainerStyle={styles.contenido}>
          <Grupo titulo="Tipo">
            {(['bache', 'basura'] as Clase[]).map((c) => (
              <Chip
                key={c}
                texto={`${c === 'bache' ? 'B' : 'R'} · ${ETIQUETA.clase[c]}`}
                activo={filtros.clases.includes(c)}
                onPress={() => onCambiar({ ...filtros, clases: alternar(filtros.clases, c) })}
              />
            ))}
          </Grupo>
          <Grupo titulo="Severidad">
            {(['alta', 'media', 'baja'] as Severidad[]).map((s) => (
              <Chip
                key={s}
                texto={ETIQUETA.severidad[s]}
                color={COLOR_SEVERIDAD[s]}
                activo={filtros.severidades.includes(s)}
                onPress={() => onCambiar({ ...filtros, severidades: alternar(filtros.severidades, s) })}
              />
            ))}
          </Grupo>
          <Grupo titulo="Estado">
            {(['pendiente', 'en_proceso', 'resuelto'] as Estado[]).map((e) => (
              <Chip
                key={e}
                texto={ETIQUETA.estado[e]}
                activo={filtros.estados.includes(e)}
                onPress={() => onCambiar({ ...filtros, estados: alternar(filtros.estados, e) })}
              />
            ))}
          </Grupo>
          {alcaldias.length > 0 && (
            <Grupo titulo="Alcaldía">
              <Chip texto="Todas" activo={filtros.alcaldia === null} onPress={() => onCambiar({ ...filtros, alcaldia: null })} />
              {alcaldias.map((a) => (
                <Chip key={a} texto={a} activo={filtros.alcaldia === a} onPress={() => onCambiar({ ...filtros, alcaldia: a })} />
              ))}
            </Grupo>
          )}
          <View style={styles.acciones}>
            <Pressable onPress={() => onCambiar(FILTROS_INICIALES)} style={styles.secundario} accessibilityRole="button">
              <Text style={styles.textoSecundario}>Restablecer</Text>
            </Pressable>
            <Pressable onPress={onCerrar} style={styles.primario} accessibilityRole="button">
              <Text style={styles.textoPrimario}>Ver resultados</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={styles.grupo}>
      <Text style={styles.tituloGrupo}>{titulo}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Chip({ texto, activo, color, onPress }: { texto: string; activo: boolean; color?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, activo && styles.chipActivo]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: activo }}>
      {color && <View style={[styles.punto, { backgroundColor: color }]} />}
      <Text style={[styles.textoChip, activo && styles.textoChipActivo]}>{texto}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  hoja: { maxHeight: '75%', backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  contenido: { padding: 20, gap: 20 },
  grupo: { gap: 10 },
  tituloGrupo: { fontSize: 16, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: '#CBD5E1' },
  chipActivo: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  punto: { width: 10, height: 10, borderRadius: 5 },
  textoChip: { color: '#0F172A', fontSize: 15 },
  textoChipActivo: { color: 'white' },
  acciones: { flexDirection: 'row', gap: 12 },
  secundario: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  textoSecundario: { fontSize: 16, fontWeight: '600' },
  primario: { flex: 2, minHeight: 52, borderRadius: 12, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center' },
  textoPrimario: { color: 'white', fontSize: 16, fontWeight: '600' },
});
