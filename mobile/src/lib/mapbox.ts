import Mapbox from '@rnmapbox/maps';

export const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? null;

if (mapboxToken) Mapbox.setAccessToken(mapboxToken);

export { Mapbox };
