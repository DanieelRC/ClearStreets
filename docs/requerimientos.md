# ClearStreets — Documento de requerimientos de la aplicación Android

| Campo | Valor |
|---|---|
| Proyecto | ClearStreets (FEPI, ESCOM-IPN, grupo 7BM1) |
| Producto | Aplicación móvil Android desarrollada con React Native (Expo) |
| Versión del documento | 1.0 — 2026-11-05 |
| Fuente | *Propuesta de proyecto: ClearStreets* (semestre 2027-1) y decisiones de alcance tomadas con el equipo |

---

## 1. Propósito y alcance

### 1.1 Propósito
Definir los requerimientos funcionales, no funcionales, técnicos y de datos de la aplicación Android de ClearStreets, que detecta y geolocaliza **baches y basura acumulada** en la vía pública de la CDMX mediante modelos de visión por computadora **preentrenados** ejecutados **en el dispositivo**, y que permite a la ciudadanía consultar y dar seguimiento a esas incidencias.

### 1.2 Dentro del alcance
- App Android (React Native + Expo, *development build*) con dos roles: **Operador en campo** y **Ciudadano**.
- Detección en vivo con la cámara del teléfono montado en el vehículo, inferencia local (TFLite).
- Geolocalización GPS, cálculo heurístico de severidad, anonimización de rostros y placas.
- Cola local sin conexión y sincronización con el backend (Supabase).
- Asignación automática de la incidencia a la alcaldía, agrupación de duplicados (10 m) y priorización.
- Para ciudadanos: mapa de incidencias, seguimiento de calles, notificaciones push, alertas de proximidad, reporte manual con foto y rutas alternativas.

### 1.3 Fuera del alcance (esta etapa)
- **Panel web para alcaldías/SOBSE** (mapa, lista de prioridad, cambio de estado, indicadores). Se documenta como sistema aparte; la app depende de él para que los estados cambien (ver §9).
- Versión iOS.
- Entrenamiento o ajuste fino de modelos: se usan modelos públicos **tal cual**.
- Integración en tiempo real con SUAC, LOCATEL, 072 u otros sistemas de gobierno.
- Asignación logística de cuadrillas.
- Otras afectaciones (grafiti, semáforos, alumbrado, banquetas).
- Importación de video de cámaras externas (dashcam).

### 1.4 Glosario
| Término | Definición |
|---|---|
| Detección | Un hallazgo del modelo en un fotograma: clase, confianza, *bounding box*, coordenadas y hora. |
| Incidencia | Afectación única en la vía; agrupa detecciones de la misma clase a ≤ 10 m. Tiene estado, severidad, frecuencia y prioridad. |
| Recorrido | Sesión de captura de un operador, de *Iniciar* a *Finalizar*. |
| Evidencia | Fotograma anonimizado (y miniatura) asociado a una detección. |
| Frecuencia | Número de detecciones independientes (distintos recorridos o reportes) de una incidencia. |

---

## 2. Actores y roles

| Rol | Descripción | Autenticación |
|---|---|---|
| **Operador** | Conductor de patrulla, camión de limpia o transporte que realiza recorridos con el teléfono montado. | Cuenta creada por invitación de la alcaldía (correo + contraseña). Sin auto-registro. |
| **Ciudadano anónimo** | Consulta el mapa y el estado de incidencias. | Sin cuenta. |
| **Ciudadano registrado** | Además sigue calles, recibe notificaciones y reporta con foto. | Registro opcional (correo + contraseña o enlace mágico). |
| **Administrador de alcaldía** *(externo a la app)* | Invita operadores y cambia estados desde el panel web. | Panel web (fuera de alcance). |

---

## 3. Requerimientos funcionales

Prioridad MoSCoW: **M** = obligatorio, **S** = debería, **C** = podría.

### 3.1 Cuenta y sesión
| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-01 | El operador inicia sesión con la cuenta que recibió por invitación; la app muestra el modo Operador solo a usuarios con rol `operador`. | M |
| RF-02 | El ciudadano puede usar la app sin cuenta (mapa y consulta). | M |
| RF-03 | El ciudadano puede registrarse, iniciar y cerrar sesión, y eliminar su cuenta. | M |
| RF-04 | La sesión persiste de forma segura entre aperturas (token en almacenamiento seguro) y se renueva automáticamente. | M |
| RF-05 | La app pide los permisos de cámara, ubicación (precisa) y notificaciones en el momento en que se necesitan, explicando el motivo. | M |

### 3.2 Recorrido y detección (Operador)
| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-10 | El operador inicia y finaliza un recorrido; la app registra hora de inicio/fin, trazo GPS y número de detecciones. | M |
| RF-11 | Durante el recorrido la app muestra la vista de cámara trasera con las cajas de detección superpuestas y un contador de detecciones, sin requerir interacción. | M |
| RF-12 | La app ejecuta en el dispositivo un modelo preentrenado de **baches** y uno de **basura acumulada** (o uno combinado si existe) sobre los fotogramas de la cámara. | M |
| RF-13 | Solo se registran detecciones con confianza ≥ umbral configurable por clase (inicial: 0.50) y que persistan en ≥ 2 fotogramas consecutivos, para reducir falsos positivos. | M |
| RF-14 | Para evitar ráfagas, una misma clase no genera más de una detección cada 10 m recorridos ni cada 2 s. | M |
| RF-15 | Cada detección guarda: clase, confianza, *bounding box* normalizada, latitud, longitud, precisión GPS, rumbo, velocidad, hora y recorrido. | M |
| RF-16 | Se descartan detecciones con precisión GPS > 20 m o a velocidad < 3 km/h sostenida por más de 60 s (vehículo detenido). | S |
| RF-17 | El operador puede registrar manualmente una incidencia con **un toque** (botón grande); se toma el fotograma actual, se ejecuta el modelo y se guarda aunque la confianza sea baja, marcada como `manual`. | M |
| RF-18 | La app calcula la **severidad** (Baja/Media/Alta) con la heurística de §3.6. | M |
| RF-19 | Al finalizar, la app muestra un resumen del recorrido (distancia, duración, detecciones por clase y severidad, pendientes de sincronizar). | M |
| RF-20 | El operador puede revisar y descartar detecciones de su recorrido antes de que se sincronicen. | S |
| RF-21 | La pantalla permanece encendida durante el recorrido y la app avisa si la batería baja de 15 % o el dispositivo se sobrecalienta (reduciendo FPS de inferencia). | S |

### 3.3 Privacidad de la evidencia
| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-30 | Antes de guardar o subir cualquier fotograma, la app detecta **rostros y placas** con modelos preentrenados en el dispositivo y los **difumina** de forma irreversible. | M |
| RF-31 | El fotograma original sin anonimizar nunca se escribe en disco ni se transmite. | M |
| RF-32 | La evidencia se guarda como JPEG reducido (lado mayor ≤ 1280 px) más miniatura (≤ 320 px), sin metadatos EXIF salvo los campos de la detección. | M |
| RF-33 | **Retención limitada**: la evidencia se elimina del almacenamiento 30 días después de que la incidencia pase a *Resuelto*, y la evidencia de detecciones descartadas a los 7 días (plazos configurables). | M |
| RF-34 | La app muestra un aviso de privacidad al primer uso y en Ajustes. | M |

### 3.4 Funcionamiento sin conexión y sincronización
| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-40 | Detecciones, recorridos y evidencias se guardan primero en una cola local (SQLite + archivos) y la captura nunca se bloquea por falta de red. | M |
| RF-41 | La cola se sincroniza automáticamente al recuperar conexión, con reintentos exponenciales y envío idempotente (UUID generado en el dispositivo). | M |
| RF-42 | El operador puede elegir subir evidencias **solo con Wi‑Fi**; los metadatos de detección siempre se envían por cualquier red. | S |
| RF-43 | La app muestra el estado de sincronización (pendientes, en curso, error) y permite reintentar manualmente. | M |
| RF-44 | La cola sobrevive al cierre de la app y al reinicio del teléfono. | M |

### 3.5 Procesamiento en el servidor
| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-50 | Al recibir una detección, el backend la asocia a una **incidencia existente** de la misma clase a ≤ 10 m con estado distinto de *Resuelto*, o crea una nueva. | M |
| RF-51 | La incidencia se asigna automáticamente a la **alcaldía** cuyo polígono la contiene (límites de alcaldías de datos abiertos CDMX). | M |
| RF-52 | Cada nueva detección actualiza en la incidencia: frecuencia, última detección, severidad máxima y prioridad. | M |
| RF-53 | La **prioridad** se calcula con la fórmula de §3.6 y permite ordenar incidencias. | M |
| RF-54 | Si se detecta un bache en el lugar de una incidencia *Resuelta* hace más de 7 días, se crea una incidencia nueva enlazada a la anterior (reincidencia). | C |
| RF-55 | Un proceso programado aplica la política de retención de RF-33. | M |

### 3.6 Reglas de severidad y prioridad
**Severidad (heurística por área)** — calculada en el dispositivo, recalculable en servidor:
- `a` = área de la *bounding box* / área del fotograma, corregida por posición vertical (los objetos en la parte superior están más lejos: `a' = a · (1 + k·(1 − y_centro))`, k inicial = 1).
- Baches: Baja si `a' < 0.02`; Media si `0.02 ≤ a' < 0.06`; Alta si `a' ≥ 0.06`.
- Basura: Baja si `a' < 0.03`; Media si `0.03 ≤ a' < 0.10`; Alta si `a' ≥ 0.10`.
- Se sube un nivel si la confianza ≥ 0.85 y la frecuencia ≥ 3.
- Los umbrales son configurables desde el backend (tabla `configuracion`) y se calibrarán con los recorridos de observación.

**Prioridad** (0–100):
`prioridad = 50·s + 30·min(1, log10(1+frecuencia)/log10(11)) + 20·min(1, días_abierta/30)`, con `s` = 0.33/0.66/1.0 para Baja/Media/Alta.

### 3.7 Mapa y consulta (Ciudadano y Operador)
| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-60 | Mapa (Mapbox) con incidencias agrupadas en *clusters*, color por severidad e ícono por clase. | M |
| RF-61 | Filtros por clase, severidad, estado (Pendiente, En proceso, Resuelto) y alcaldía. | M |
| RF-62 | Detalle de incidencia: clase, severidad, estado, alcaldía, frecuencia, primera/última detección, historial de estados y miniaturas anonimizadas. | M |
| RF-63 | Lista de incidencias cercanas ordenada por distancia o por prioridad. | S |
| RF-64 | El operador ve además sus recorridos y detecciones propias. | S |

### 3.8 Seguimiento y notificaciones (Ciudadano registrado)
| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-70 | El ciudadano puede **seguir una calle o zona** (punto + radio de 100–500 m) y una incidencia concreta. | M |
| RF-71 | Recibe una **notificación push** cuando una incidencia seguida cambia de estado o aparece una nueva de severidad Alta en una zona seguida. | M |
| RF-72 | Puede administrar sus seguimientos y silenciar notificaciones. | M |

### 3.9 Alertas de proximidad
| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-80 | Con el **modo conducción** activado, la app avisa (sonido + vibración + banner) al acercarse a ≤ 150 m de un bache de severidad Alta no resuelto que esté en su dirección de avance (diferencia de rumbo ≤ 45°). | M |
| RF-81 | El modo conducción funciona con la pantalla apagada mediante un servicio en primer plano de Android con notificación persistente; el usuario lo activa y desactiva explícitamente. | S |
| RF-82 | Las incidencias cercanas se descargan por mosaico (radio 5 km) y se guardan en caché para funcionar con mala cobertura. | S |
| RF-83 | No se repite la misma alerta en menos de 10 minutos. | M |

### 3.10 Reporte manual del ciudadano
| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-90 | El ciudadano registrado puede tomar una foto (no desde galería, para garantizar ubicación y hora reales) y enviarla como reporte. | M |
| RF-91 | El modelo valida en el dispositivo si la foto contiene bache o basura; si no, se avisa y el reporte se envía marcado como `no_verificado`. | M |
| RF-92 | La foto se anonimiza (RF-30) y se procesa con las mismas reglas de agrupación y alcaldía. | M |
| RF-93 | Límite de 10 reportes por usuario por día para evitar abuso. | S |

### 3.11 Rutas alternativas
| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-100 | El ciudadano puede trazar una ruta origen–destino (Mapbox Directions) y ver cuántas incidencias de severidad Media/Alta hay sobre ella. | S |
| RF-101 | La app solicita rutas alternativas y recomienda la de menor costo `duración + penalización por incidencia` (Alta = 120 s, Media = 45 s, configurable). | S |
| RF-102 | La navegación paso a paso no es requerida: se puede abrir la ruta elegida en la app de navegación del usuario. | C |

---

## 4. Requerimientos no funcionales

| ID | Categoría | Requerimiento |
|---|---|---|
| RNF-01 | Plataforma | Android 10 (API 29) o superior; *target* la API vigente exigida por Google Play. Solo orientación vertical en recorrido (horizontal opcional). |
| RNF-02 | Dispositivo objetivo | Gama media, ≥ 4 GB RAM, cámara trasera ≥ 12 MP, GPS. |
| RNF-03 | Rendimiento de inferencia | ≥ 5 FPS de detección efectiva y latencia por fotograma ≤ 200 ms en el dispositivo objetivo, con delegado GPU/NNAPI cuando esté disponible y respaldo en CPU. |
| RNF-04 | Fluidez | La vista de cámara se mantiene a ≥ 24 FPS; la inferencia corre fuera del hilo de JS (frame processors). |
| RNF-05 | Batería y temperatura | Un recorrido de 60 min no consume más de 25 % de batería con el teléfono conectado a cargador vehicular apagado; si se detecta estrés térmico se reduce la inferencia a 2 FPS. |
| RNF-06 | Datos móviles | Metadatos ≤ 2 KB por detección; evidencia ≤ 150 KB por detección; nunca se sube video. |
| RNF-07 | Tamaño | APK/AAB ≤ 80 MB incluidos los modelos. |
| RNF-08 | Precisión mínima aceptable | En el conjunto de validación de CDMX (fotos de recorridos de observación): baches mAP@0.5 ≥ 0.60 y precisión ≥ 0.70; basura mAP@0.5 ≥ 0.50. Si un modelo público no los alcanza, se documenta y se escala a ajuste fino como trabajo futuro. |
| RNF-09 | Disponibilidad | Backend gestionado (Supabase) con disponibilidad del plan contratado; la app sigue capturando sin backend (RF-40). |
| RNF-10 | Seguridad | HTTPS/TLS; *Row Level Security* en todas las tablas; operadores solo escriben sus propias detecciones; ciudadanos solo leen datos públicos y escriben sus seguimientos y reportes; claves de servicio jamás en la app. |
| RNF-11 | Privacidad | Cumplimiento de la LFPDPPP y Ley de Protección de Datos Personales de la CDMX: anonimización (RF-30), minimización, retención (RF-33), aviso de privacidad, eliminación de cuenta. La ubicación del ciudadano no se almacena en el servidor salvo en sus seguimientos. |
| RNF-12 | Usabilidad | En recorrido, ninguna acción obligatoria requiere más de un toque; botones ≥ 64 dp; textos legibles a 60 cm; modo oscuro. |
| RNF-13 | Accesibilidad | Etiquetas de accesibilidad (TalkBack), contraste WCAG AA, alertas con sonido y vibración además de visuales. |
| RNF-14 | Idioma | Español (México); textos externalizados para i18n futura. |
| RNF-15 | Mantenibilidad | TypeScript estricto, ESLint/Prettier, pruebas unitarias de lógica (severidad, prioridad, cola) con cobertura ≥ 70 %. |
| RNF-16 | Configurabilidad | Umbrales de confianza, severidad, radios y retención se leen de configuración remota con valores por defecto locales. |
| RNF-17 | Observabilidad | Registro de errores y fallos (p. ej. Sentry) sin datos personales; métricas de FPS y latencia de inferencia por versión de modelo. |
| RNF-18 | Licencias | Los modelos preentrenados y sus pesos deben tener licencia compatible con uso académico/público; se registra fuente, versión y licencia de cada modelo. |

---

## 5. Arquitectura y stack técnico

### 5.1 Aplicación móvil
| Necesidad | Tecnología |
|---|---|
| Base | React Native + **Expo** (SDK estable vigente) con **development build** y EAS Build; TypeScript. |
| Navegación | Expo Router. |
| Cámara y fotogramas | `react-native-vision-camera` (frame processors) + `react-native-worklets-core`. |
| Inferencia | `react-native-fast-tflite` con modelos `.tflite` (INT8/FP16), delegado GPU/NNAPI; redimensionado con `vision-camera-resize-plugin`. |
| Anonimización | Modelo de rostros (p. ej. BlazeFace / MediaPipe Face Detection) y modelo de placas preentrenado en TFLite; difuminado con Skia (`@shopify/react-native-skia`). |
| Ubicación | `expo-location` (alta precisión); `expo-task-manager` + servicio en primer plano para modo conducción. |
| Almacenamiento local | `expo-sqlite` (cola, caché de incidencias), `expo-file-system` (evidencias), `expo-secure-store` (tokens). |
| Mapas y rutas | `@rnmapbox/maps`; Mapbox Directions API. |
| Backend cliente | `@supabase/supabase-js`. |
| Notificaciones | `expo-notifications` con FCM. |
| Estado y datos | TanStack Query (servidor) + Zustand (estado local). |
| Otros | `expo-keep-awake`, `expo-battery`, `expo-haptics`, `expo-av` para sonidos de alerta. |

### 5.2 Modelos de visión (preentrenados, sin reentrenar)
- **Baches**: modelo YOLO nano/small público (YOLOv8n/YOLO11n o equivalente) entrenado en datasets de baches (p. ej. de Roboflow Universe o Hugging Face), exportado a TFLite.
- **Basura acumulada**: modelo público de detección de basura/residuos en vía pública, exportado a TFLite.
- **Rostros y placas**: modelos públicos ligeros para anonimización.
- Selección: se evalúan ≥ 2 candidatos por clase con el conjunto de validación de CDMX; se elige el que cumpla RNF-03, RNF-07 y RNF-08 con licencia válida (RNF-18).
- Los modelos se empaquetan en la app y se identifican por `modelo_version` en cada detección. Actualización remota de modelos: trabajo futuro.

### 5.3 Backend (Supabase)
- **PostgreSQL + PostGIS**: tablas, índices GiST y funciones RPC (`registrar_deteccion`, `incidencias_cercanas`, `incidencias_en_ruta`).
- **Auth**: correo/contraseña e invitaciones para operadores; roles en `perfiles.rol`.
- **Storage**: bucket privado `evidencias` con URLs firmadas de corta duración.
- **Edge Functions**: envío de notificaciones push al cambiar estados; validaciones adicionales.
- **pg_cron**: retención (RF-33) y recálculo diario de prioridad.
- **Realtime**: actualización del mapa cuando cambian estados.

### 5.4 Flujo principal
1. El operador inicia recorrido → la cámara entrega fotogramas → el frame processor ejecuta el modelo.
2. Detección válida (RF-13/14) → se toma GPS → se anonimiza el fotograma → se calcula severidad → se guarda en SQLite.
3. El sincronizador envía la detección a `registrar_deteccion` y sube la evidencia a Storage.
4. PostGIS agrupa (≤ 10 m), asigna alcaldía y recalcula prioridad.
5. El panel web (externo) cambia el estado → Edge Function → push a ciudadanos que siguen la zona.
6. El ciudadano consulta el mapa, recibe alertas de proximidad y planea rutas alternativas.

El diagrama de arquitectura está en [`arquitectura.html`](arquitectura.html).

---

## 6. Modelo de datos (resumen)

| Tabla | Campos principales |
|---|---|
| `alcaldias` | `id`, `nombre`, `geom MultiPolygon(4326)` |
| `perfiles` | `id (=auth.users)`, `rol (operador/ciudadano/admin)`, `alcaldia_id`, `nombre`, `creado_en` |
| `recorridos` | `id uuid`, `operador_id`, `inicio`, `fin`, `trazo LineString`, `distancia_m`, `dispositivo`, `app_version` |
| `incidencias` | `id`, `clase (bache/basura)`, `severidad`, `estado (pendiente/en_proceso/resuelto)`, `geom Point`, `alcaldia_id`, `frecuencia`, `prioridad`, `primera_deteccion`, `ultima_deteccion`, `resuelta_en`, `incidencia_previa_id` |
| `detecciones` | `id uuid (cliente)`, `incidencia_id`, `recorrido_id?`, `usuario_id`, `origen (auto/manual/ciudadano)`, `clase`, `confianza`, `bbox`, `geom Point`, `precision_m`, `rumbo`, `velocidad`, `severidad`, `verificado`, `modelo_version`, `evidencia_path`, `capturada_en` |
| `historial_estado` | `incidencia_id`, `estado_anterior`, `estado_nuevo`, `usuario_id`, `nota`, `fecha` |
| `seguimientos` | `id`, `usuario_id`, `tipo (zona/incidencia)`, `geom Point?`, `radio_m?`, `incidencia_id?` |
| `dispositivos_push` | `usuario_id`, `token`, `plataforma`, `actualizado_en` |
| `configuracion` | `clave`, `valor jsonb` (umbrales, radios, retención, penalizaciones) |

---

## 7. Pantallas

| Rol | Pantalla | RF |
|---|---|---|
| Común | Bienvenida y aviso de privacidad, selección de modo, inicio de sesión | RF-01–05, RF-34 |
| Operador | Inicio (resumen, pendientes de sincronizar) | RF-43 |
| Operador | Recorrido en vivo (cámara, cajas, contador, botón de un toque, estado GPS/red) | RF-10–21 |
| Operador | Resumen y revisión del recorrido | RF-19, RF-20 |
| Operador | Historial de recorridos | RF-64 |
| Ambos | Mapa de incidencias con filtros | RF-60, RF-61 |
| Ambos | Detalle de incidencia | RF-62 |
| Ciudadano | Mis seguimientos | RF-70–72 |
| Ciudadano | Modo conducción | RF-80–83 |
| Ciudadano | Reportar con foto | RF-90–93 |
| Ciudadano | Rutas alternativas | RF-100–102 |
| Ambos | Ajustes (Wi‑Fi para evidencias, notificaciones, cuenta, privacidad) | RF-03, RF-42, RF-72 |

---

## 8. Criterios de aceptación clave

1. Un recorrido de 30 min por una ruta de prueba sin conexión genera detecciones que aparecen en el mapa ≤ 2 min después de recuperar la red, sin pérdidas ni duplicados.
2. Pasar tres veces sobre el mismo bache en recorridos distintos produce **una** incidencia con frecuencia 3.
3. Ninguna evidencia almacenada contiene rostros o placas legibles en una muestra auditada de 100 imágenes.
4. Una incidencia en Iztapalapa queda asignada a Iztapalapa (prueba con puntos cerca de los límites entre alcaldías).
5. Al cambiar una incidencia seguida a *Resuelto*, el ciudadano recibe la notificación en ≤ 1 min.
6. En modo conducción, la alerta suena antes de llegar a un bache Alto ubicado en la dirección de avance y no suena para uno detrás del vehículo.
7. Las métricas de RNF-03 y RNF-08 se reportan con el dispositivo objetivo y el conjunto de validación.

---

## 9. Supuestos, dependencias y riesgos

| Tipo | Descripción | Mitigación |
|---|---|---|
| Dependencia | El cambio de estado de incidencias lo hace el panel web de alcaldías (fuera de alcance). | Mientras no exista, usar el dashboard de Supabase o una función administrativa para pruebas. |
| Riesgo | Los modelos públicos “tal cual” pueden no generalizar a calles de CDMX (iluminación, lluvia, sombras, tipos de basura). | Evaluar varios candidatos (RNF-08); umbral por persistencia (RF-13); revisión del operador (RF-20); ajuste fino como trabajo futuro. |
| Riesgo | Puede no existir un modelo público de “basura acumulada en vía pública” con licencia adecuada. | Buscar y evaluar al inicio del proyecto; si no hay, documentar y dejar basura con reporte manual. |
| Riesgo | Ejecutar 3–4 modelos (baches, basura, rostros, placas) sature el dispositivo. | Anonimización solo sobre fotogramas con detección (no en cada fotograma); alternar modelos de detección entre fotogramas. |
| Riesgo | Error de GPS en zonas de edificios altos agrupa o separa mal incidencias. | Descartar precisión > 20 m (RF-16); radio configurable. |
| Riesgo | Restricciones de Android a servicios en segundo plano y ahorro de batería de fabricantes. | Servicio en primer plano declarado; guía para excluir la app de optimización de batería. |
| Riesgo | Costos de Mapbox/Supabase al crecer. | Mantenerse en planes gratuitos en desarrollo; caché local de teselas e incidencias. |
| Supuesto | Los operadores cuentan con soporte para teléfono en el parabrisas y cargador vehicular. | Incluirlo en la guía de instalación. |
| Supuesto | Los polígonos de alcaldías se obtienen del portal de datos abiertos de la CDMX. | Cargar en la migración inicial. |

---

## 10. Trazabilidad con la propuesta

| Objetivo / eje de la propuesta | Requerimientos |
|---|---|
| Detectar y clasificar baches y basura con visión por computadora | RF-12–18, RNF-03, RNF-08 |
| Geolocalización GPS de cada detección | RF-15, RF-16, RF-51 |
| Reportes estructurados a la alcaldía | RF-50–53, §6 |
| Priorización objetiva por frecuencia y severidad | RF-18, RF-52, RF-53, §3.6 |
| Seguimiento, notificaciones e indicadores | RF-62, RF-70–72 |
| Mapa de riesgo y rutas alternativas | RF-60–63, RF-80–83, RF-100–102 |
| Privacidad y eficiencia de datos | RF-30–34, RF-42, RNF-06, RNF-11 |
| Registro con un toque sin desviar la ruta | RF-11, RF-17, RNF-12 |
