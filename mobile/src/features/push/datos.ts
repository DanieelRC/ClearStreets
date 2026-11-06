/** Extrae el id de incidencia del `data` de una notificación (lo arma la Edge Function `notificar`). */
export function incidenciaDeNotificacion(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null;
  const n = Number((data as { incidenciaId?: unknown }).incidenciaId);
  return Number.isInteger(n) && n > 0 ? n : null;
}
