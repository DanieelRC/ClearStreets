# Modelos de visión (TFLite)

Coloca aquí los modelos preentrenados **sin reentrenar** (requerimientos §5.2, RNF-18):

| Archivo | Uso | Fuente / versión / licencia |
|---|---|---|
| `baches.tflite` | Detección de baches | _por definir tras evaluación_ |
| `basura.tflite` | Detección de basura acumulada | _por definir_ |
| `rostros.tflite` | Anonimización de rostros | _por definir_ |
| `placas.tflite` | Anonimización de placas | _por definir_ |

Requisitos: entrada RGB uint8 o float32, exportación INT8/FP16, ≤ 80 MB en total con la app, licencia compatible.
Se cargan con `useTensorflowModel(require('@/assets/models/baches.tflite'), ['android-gpu'])`.
