import { useEffect, useState } from 'react';
import { loadTensorflowModel, type TensorflowModel } from 'react-native-fast-tflite';

import { MODELOS, type ModeloConfig } from './modelos';

export interface ModeloCargado {
  config: ModeloConfig;
  model: TensorflowModel;
}

export type EstadoModelos =
  | { estado: 'cargando'; modelos: ModeloCargado[] }
  | { estado: 'listo'; modelos: ModeloCargado[]; faltantes: string[] }
  | { estado: 'error'; modelos: ModeloCargado[]; error: string };

/** Carga los modelos configurados (GPU si está disponible, si no CPU). */
export function useModelos(): EstadoModelos {
  const [s, setS] = useState<EstadoModelos>({ estado: 'cargando', modelos: [] });

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const cargados: ModeloCargado[] = [];
      const faltantes: string[] = [];
      try {
        for (const config of MODELOS) {
          if (!config.fuente) {
            faltantes.push(config.id);
            continue;
          }
          let model: TensorflowModel;
          try {
            model = await loadTensorflowModel(config.fuente, ['android-gpu']);
          } catch {
            model = await loadTensorflowModel(config.fuente, []);
          }
          cargados.push({ config, model });
        }
        if (!cancelado) setS({ estado: 'listo', modelos: cargados, faltantes });
      } catch (e) {
        if (!cancelado) setS({ estado: 'error', modelos: cargados, error: String(e) });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return s;
}
