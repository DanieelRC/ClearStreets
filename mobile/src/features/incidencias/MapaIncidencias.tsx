import type { ComponentProps } from 'react';
import { useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';

import type { LatLng } from '@/domain/types';
import { Mapbox } from '@/lib/mapbox';

import { aGeoJSON, COLOR_SEVERIDAD, type Incidencia } from './logica';

type OnPressEvent = Parameters<NonNullable<ComponentProps<typeof Mapbox.ShapeSource>['onPress']>>[0];

interface Props {
  incidencias: Incidencia[];
  centroInicial: LatLng;
  mostrarUbicacion: boolean;
  onSeleccionar: (id: number) => void;
  onMover: (centro: LatLng) => void;
}

/** Mapa con clusters: color por severidad y letra por clase (RF-60). */
export function MapaIncidencias({ incidencias, centroInicial, mostrarUbicacion, onSeleccionar, onMover }: Props) {
  const fuente = useRef<Mapbox.ShapeSource>(null);
  const camara = useRef<Mapbox.Camera>(null);
  const shape = useMemo(() => aGeoJSON(incidencias), [incidencias]);

  const alPresionar = async (e: OnPressEvent) => {
    const f = e.features[0];
    if (!f || f.geometry.type !== 'Point') return;
    if (f.properties?.cluster) {
      const zoom = await fuente.current?.getClusterExpansionZoom(f);
      camara.current?.setCamera({ centerCoordinate: f.geometry.coordinates, zoomLevel: zoom, animationDuration: 400 });
    } else if (f.properties?.id != null) {
      onSeleccionar(Number(f.properties.id));
    }
  };

  return (
    <Mapbox.MapView
      style={StyleSheet.absoluteFill}
      styleURL={Mapbox.StyleURL.Street}
      scaleBarEnabled={false}
      compassEnabled
      onMapIdle={(s) => onMover({ lng: s.properties.center[0], lat: s.properties.center[1] })}>
      <Mapbox.Camera
        ref={camara}
        defaultSettings={{ centerCoordinate: [centroInicial.lng, centroInicial.lat], zoomLevel: 13 }}
      />
      {mostrarUbicacion && <Mapbox.LocationPuck puckBearingEnabled puckBearing="heading" />}

      <Mapbox.ShapeSource
        id="incidencias"
        ref={fuente}
        shape={shape}
        cluster
        clusterRadius={48}
        clusterMaxZoomLevel={16}
        clusterProperties={{ altas: ['+', ['get', 'alta']] }}
        onPress={alPresionar}
        hitbox={{ width: 32, height: 32 }}>
        <Mapbox.CircleLayer
          id="clusters"
          filter={['has', 'point_count']}
          style={{
            circleColor: ['case', ['>', ['get', 'altas'], 0], COLOR_SEVERIDAD.alta, COLOR_SEVERIDAD.media],
            circleRadius: ['step', ['get', 'point_count'], 18, 10, 24, 50, 30],
            circleOpacity: 0.9,
            circleStrokeColor: 'white',
            circleStrokeWidth: 2,
          }}
        />
        <Mapbox.SymbolLayer
          id="clusters-cuenta"
          filter={['has', 'point_count']}
          style={{ textField: ['get', 'point_count_abbreviated'], textColor: 'white', textSize: 14, textAllowOverlap: true }}
        />
        <Mapbox.CircleLayer
          id="puntos"
          filter={['!', ['has', 'point_count']]}
          style={{
            circleColor: [
              'match',
              ['get', 'severidad'],
              'alta',
              COLOR_SEVERIDAD.alta,
              'media',
              COLOR_SEVERIDAD.media,
              COLOR_SEVERIDAD.baja,
            ],
            circleRadius: 11,
            circleStrokeColor: ['match', ['get', 'estado'], 'en_proceso', '#2563EB', 'resuelto', '#16A34A', 'white'],
            circleStrokeWidth: 3,
          }}
        />
        <Mapbox.SymbolLayer
          id="puntos-clase"
          filter={['!', ['has', 'point_count']]}
          style={{
            textField: ['match', ['get', 'clase'], 'bache', 'B', 'R'],
            textColor: 'white',
            textSize: 12,
            textAllowOverlap: true,
          }}
        />
      </Mapbox.ShapeSource>
    </Mapbox.MapView>
  );
}
