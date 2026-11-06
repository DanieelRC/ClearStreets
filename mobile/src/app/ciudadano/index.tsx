import { Link, router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LatLng } from '@/domain/types';
import { useIncidenciasCercanas } from '@/features/incidencias/api';
import { FilaIncidencia } from '@/features/incidencias/FilaIncidencia';
import { alcaldiasDe, FILTROS_INICIALES, filtrar, ordenar, type Filtros, type Orden } from '@/features/incidencias/logica';
import { MapaIncidencias } from '@/features/incidencias/MapaIncidencias';
import { PanelFiltros } from '@/features/incidencias/PanelFiltros';
import { CENTRO_CDMX, useMiUbicacion } from '@/features/incidencias/useMiUbicacion';
import { SeguirZonaBoton } from '@/features/seguimiento/SeguirZonaBoton';
import { mapboxToken } from '@/lib/mapbox';

/** Mapa y lista de incidencias para la ciudadanía (RF-60–63). */
export default function MapaCiudadano() {
  const { pos, permitida } = useMiUbicacion();
  const [centroMapa, setCentroMapa] = useState<LatLng | null>(null);
  const [vista, setVista] = useState<'mapa' | 'lista'>(mapboxToken ? 'mapa' : 'lista');
  const [orden, setOrden] = useState<Orden>('distancia');
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);
  const [panel, setPanel] = useState(false);

  // Hasta conocer la ubicación (o su rechazo) no se consulta, para no pedir dos zonas.
  const centroConsulta = centroMapa ?? pos ?? (permitida === false ? CENTRO_CDMX : null);
  const consulta = useIncidenciasCercanas(centroConsulta);
  const todas = useMemo(() => consulta.data ?? [], [consulta.data]);
  const visibles = useMemo(() => filtrar(todas, filtros), [todas, filtros]);
  const lista = useMemo(() => ordenar(visibles, orden, pos), [visibles, orden, pos]);
  const alcaldias = useMemo(() => alcaldiasDe(todas), [todas]);
  const filtrosActivos = JSON.stringify(filtros) !== JSON.stringify(FILTROS_INICIALES);

  const abrir = (id: number) => router.push({ pathname: '/ciudadano/incidencia/[id]', params: { id: String(id) } });

  return (
    <View style={styles.fondo}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/ciudadano/cuenta" asChild>
              <Pressable accessibilityRole="button" hitSlop={12}>
                <Text style={styles.cuenta}>Mi cuenta</Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      {vista === 'mapa' && centroConsulta ? (
        <MapaIncidencias
          incidencias={visibles}
          centroInicial={pos ?? centroConsulta}
          mostrarUbicacion={permitida === true}
          onSeleccionar={abrir}
          onMover={setCentroMapa}
        />
      ) : (
        <FlatList
          contentContainerStyle={styles.lista}
          data={lista}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => <FilaIncidencia i={item} onPress={() => abrir(item.id)} />}
          ListHeaderComponent={<View style={{ height: 64 }} />}
          ListEmptyComponent={
            consulta.isPending ? undefined : (
              <Text style={styles.vacio}>No hay incidencias con estos filtros en un radio de 5 km.</Text>
            )
          }
          refreshing={consulta.isRefetching}
          onRefresh={() => consulta.refetch()}
        />
      )}

      <View style={styles.barra} pointerEvents="box-none">
        <View style={styles.fila}>
          {mapboxToken && (
            <Segmento
              opciones={[
                ['mapa', 'Mapa'],
                ['lista', 'Lista'],
              ]}
              valor={vista}
              onCambiar={setVista}
            />
          )}
          {vista === 'lista' && (
            <Segmento
              opciones={[
                ['distancia', 'Cercanas'],
                ['prioridad', 'Prioridad'],
              ]}
              valor={orden}
              onCambiar={setOrden}
            />
          )}
          <Link href="/ciudadano/conduccion" asChild>
            <Pressable style={styles.botonConduccion} accessibilityRole="button" accessibilityLabel="Modo conducción">
              <Text style={styles.textoFiltros}>🚗</Text>
            </Pressable>
          </Link>
          <Pressable style={[styles.botonFiltros, filtrosActivos && styles.botonFiltrosActivo]} onPress={() => setPanel(true)} accessibilityRole="button">
            <Text style={[styles.textoFiltros, filtrosActivos && { color: 'white' }]}>Filtros{filtrosActivos ? ' •' : ''}</Text>
          </Pressable>
        </View>
        {(consulta.isPending && centroConsulta) || consulta.isFetching ? (
          <ActivityIndicator style={styles.cargando} />
        ) : null}
        {consulta.error && <Text style={styles.error}>{consulta.error.message}</Text>}
        {!mapboxToken && <Text style={styles.aviso}>Mapa no disponible: falta EXPO_PUBLIC_MAPBOX_TOKEN.</Text>}
        {vista === 'mapa' && consulta.data && (
          <Text style={styles.contador}>
            {visibles.length} de {todas.length} incidencias
          </Text>
        )}
      </View>

      {vista === 'mapa' && centroConsulta && (
        <View style={styles.abajo} pointerEvents="box-none">
          <SeguirZonaBoton centro={centroMapa ?? centroConsulta} />
        </View>
      )}

      <PanelFiltros visible={panel} filtros={filtros} alcaldias={alcaldias} onCambiar={setFiltros} onCerrar={() => setPanel(false)} />
    </View>
  );
}

function Segmento<T extends string>({ opciones, valor, onCambiar }: { opciones: [T, string][]; valor: T; onCambiar: (v: T) => void }) {
  return (
    <View style={styles.segmento} accessibilityRole="tablist">
      {opciones.map(([v, texto]) => (
        <Pressable
          key={v}
          onPress={() => onCambiar(v)}
          style={[styles.opcion, valor === v && styles.opcionActiva]}
          accessibilityRole="tab"
          accessibilityState={{ selected: valor === v }}>
          <Text style={[styles.textoOpcion, valor === v && styles.textoOpcionActiva]}>{texto}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const sombra = { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 3 };

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: '#F1F5F9' },
  cuenta: { color: '#0F766E', fontSize: 16, fontWeight: '600' },
  abajo: { position: 'absolute', left: 16, right: 16, bottom: 32 },
  lista: { padding: 16, gap: 10 },
  vacio: { textAlign: 'center', color: '#64748B', marginTop: 32 },
  barra: { position: 'absolute', top: 0, left: 0, right: 0, padding: 12, gap: 8 },
  fila: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  segmento: { flexDirection: 'row', backgroundColor: 'white', borderRadius: 22, padding: 3, ...sombra },
  opcion: { minHeight: 40, paddingHorizontal: 14, borderRadius: 19, justifyContent: 'center' },
  opcionActiva: { backgroundColor: '#0F766E' },
  textoOpcion: { fontSize: 15, color: '#0F172A' },
  textoOpcionActiva: { color: 'white', fontWeight: '600' },
  botonFiltros: { minHeight: 46, paddingHorizontal: 16, borderRadius: 23, backgroundColor: 'white', justifyContent: 'center', ...sombra },
  botonConduccion: { marginLeft: 'auto', minWidth: 46, minHeight: 46, borderRadius: 23, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', ...sombra },
  botonFiltrosActivo: { backgroundColor: '#0F172A' },
  textoFiltros: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  cargando: { alignSelf: 'center' },
  error: { backgroundColor: '#FEE2E2', color: '#991B1B', padding: 10, borderRadius: 10 },
  aviso: { backgroundColor: '#FEF3C7', color: '#92400E', padding: 10, borderRadius: 10 },
  contador: { alignSelf: 'flex-start', backgroundColor: 'rgba(15,23,42,0.8)', color: 'white', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
});
