import { bearingDeg, distanceM, isAhead } from '../geo';

// Zócalo CDMX y un punto ~111 m al norte.
const zocalo = { lat: 19.4326, lng: -99.1332 };
const norte = { lat: 19.4336, lng: -99.1332 };
const este = { lat: 19.4326, lng: -99.1322 };

describe('distanceM', () => {
  it('calcula ~111 m por milésima de grado de latitud', () => {
    expect(distanceM(zocalo, norte)).toBeCloseTo(111.2, 0);
  });
  it('es 0 para el mismo punto', () => {
    expect(distanceM(zocalo, zocalo)).toBe(0);
  });
});

describe('bearingDeg', () => {
  it('norte = 0°', () => {
    expect(bearingDeg(zocalo, norte)).toBeCloseTo(0, 0);
  });
  it('este = 90°', () => {
    expect(bearingDeg(zocalo, este)).toBeCloseTo(90, 0);
  });
});

describe('isAhead', () => {
  it('true si el punto está en la dirección de avance', () => {
    expect(isAhead(zocalo, 10, norte, 45)).toBe(true);
  });
  it('false si está detrás', () => {
    expect(isAhead(zocalo, 180, norte, 45)).toBe(false);
  });
  it('maneja el cruce 359°/0°', () => {
    expect(isAhead(zocalo, 350, norte, 45)).toBe(true);
  });
});
