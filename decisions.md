# SmartOne v3 — Registro de Decisiones de Modelo de Datos

Este documento registra desviaciones/ampliaciones explícitas respecto a la
Matriz Maestra original de entidades del sistema. No existía antes de esta
entrada — se crea junto con la entidad 17 (RelaciónLaboral), y de paso se
documenta retroactivamente la entidad 16 (Asignación), que ya estaba
implementada en el código pero sin este registro.

---

## Entidad 16 — Asignación (Persona/Recurso ↔ Proyecto)

**Agregada:** ya implementada al momento de escribir este documento
(`functions/src/services/asignacionService.js`,
`functions/src/repositories/asignacionRepository.js`).

**Motivo:** vincula una Persona O un Recurso (maquinaria/vehículo) a un
Proyecto, a través de la Empresa que los aporta — relación que no encajaba
en ninguna de las 15 entidades originales.

Colección raíz: `asignaciones`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| asignacionId | string | Sí | ID del documento (autogenerado) |
| proyectoId | string (ref) | Sí | Referencia a `proyectos` |
| empresaId | string (ref) | Sí | Empresa que aporta a la Persona/Recurso |
| personaId | string (ref) | Condicional | Uno de personaId/recursoId, no ambos |
| recursoId | string (ref) | Condicional | Uno de personaId/recursoId, no ambos |
| mandanteId | string (ref) | Sí | Derivado del Proyecto, nunca del payload del cliente |
| rol | string | Solo si es Persona | Catálogo fijo: trabajador, operador, prevencionista (RN-044: el rol vive en Asignación, NUNCA en Persona) |
| estado | string | Sí | `"pendiente" \| "activa" \| "finalizada"` |
| createdAt / updatedAt | timestamp | Sí | Auditoría estándar |

**Reglas de negocio:**
- **RN-044** — El rol de una Persona en un Proyecto no se guarda en
  Persona, se resuelve en tiempo real desde su Asignación activa.
- **RN-064** — Una Persona (o un Recurso) no puede tener dos Asignaciones
  `estado = "activa"` simultáneas en el **mismo** Proyecto (sí puede tener
  Asignaciones activas en Proyectos distintos).

---

## Entidad 17 — RelaciónLaboral (Persona ↔ Empresa)

> **Reemplazada por el Bloque 3** (ver "Relaciones de Empresa" al final): la colección `relacionesLaborales` y los campos denormalizados en el documento ya no existen.

**Agregada:** ver spec "Corrección Pantalla Detalle/Editar Persona".

**Motivo:** separar la relación LABORAL de una Persona con una Empresa
(RelaciónLaboral) de su relación de PARTICIPACIÓN en un Proyecto
(Asignación, entidad 16) — antes ambas vivían mezcladas de forma implícita
en el campo plano `Persona.empresaId`, sin historial ni forma de
representar un cambio de empleador.

Colección raíz: `relacionesLaborales`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| relacionLaboralId | string | Sí | ID del documento (autogenerado) |
| personaId | string (ref) | Sí | Referencia a `personas` |
| empresaId | string (ref) | Sí | Referencia a `empresas` |
| tipoRelacion | string | Sí | Texto libre. Ej: "Trabajador", "Contratista independiente" |
| cargo | string | Sí | Texto libre. Ej: "Operador de Camión" |
| tipoContrato | string | Sí | Texto libre. Ej: "Plazo Fijo", "Indefinido" |
| jornada | string | No | Texto libre. Ej: "Diurna", "Turno" |
| fechaInicio | timestamp | Sí | Inicio de la relación |
| fechaTermino | timestamp | No | Solo si `estado = "finalizada"` |
| estado | string | Sí | `"activa" \| "finalizada"` |
| createdAt / updatedAt | timestamp | Sí | Auditoría estándar |

**Reglas de negocio:**
- **RN-041b** — Una Persona solo puede tener UNA RelaciónLaboral con
  `estado = "activa"` a la vez. Garantizado por construcción dentro de la
  transacción de `cambiarEmpresa` (nunca dos escrituras separadas que
  puedan dejar el estado inconsistente).
- **RN-063** — "Cambiar Empresa" (`relacionLaboralService.cambiarEmpresa`)
  ejecuta, en una única transacción de Firestore: (1) cierra la
  RelaciónLaboral activa actual (`estado: "finalizada"`,
  `fechaTermino: ahora`), (2) crea la nueva RelaciónLaboral activa, (3)
  actualiza el denormalizado en Persona (`empresaId`/`empresaActivaId`/
  `cargoActivo`). NO modifica ni elimina Asignaciones a Proyectos
  existentes — el historial de participación en Proyectos no se reescribe.
- **RN-104** — Todo cambio de Empresa activa se registra en Bitácora
  (`entidad: "persona"`, `accion: "cambio_empresa"`), con empresa/cargo
  anterior y nuevo.

**Cambios a Persona:**
- Se agregan los campos denormalizados `empresaActivaId` y `cargoActivo`,
  mantenidos EXCLUSIVAMENTE por `relacionLaboralService` (nunca editables
  vía `personaService.actualizarPersona` — quedan fuera de su
  `allowedFields` a propósito).
- El campo `empresaId` original de Persona se mantiene (no se elimina, por
  la enorme cantidad de código existente que ya lo referencia), pero pasa
  a mantenerse en sincronía con `empresaActivaId` en cada cambio de
  empresa — en la práctica ambos quedan siempre iguales.
- **No existían campos planos** `cargo`/`tipoContrato`/`jornada`/
  `fechaContratacion`/`fechaTerminoContrato`/`estadoLaboral`/
  `empresaPrincipalId` en el modelo real de Persona antes de esta entidad
  — se verificó contra el código (`personaService.js`) y contra el seed
  data antes de escribir la migración; no había nada que eliminar ni
  migrar en ese sentido. La migración (`migrarRelacionesLaborales.js`) es
  un **backfill**, no una recuperación de datos históricos reales: crea
  una RelaciónLaboral activa por cada Persona preexistente usando su
  `empresaId` ya existente, con `tipoRelacion`/`cargo`/`tipoContrato` en
  placeholder ("No especificado" / "Trabajador") porque ese dato nunca se
  capturó.

**Limitación conocida (heredada del mismo patrón ya visto en
Requerimiento):** Persona es un catálogo global sin `mandanteId`, así que
los eventos de bitácora de `cambio_empresa` quedan con `mandanteId: null`
— visibles para superadmin/evaluador, pero invisibles para
mandante_admin/mandante_lector en su feed de bitácora filtrado por
mandanteId. No se resolvió en esta entrega (requeriría repensar cómo la
bitácora trata entidades globales).

---

## Entidad 18 — Perfil de Recurso (Rol de Persona / Clasificación de Maquinaria)

**Agregada:** a pedido explícito — reemplaza los catálogos fijos
`ROLES_ASIGNACION` (`asignacionService.js`) y `TIPOS_RECURSO`
(`recursoService.js`), ambos hardcodeados en el código y espejados a
mano en el frontend.

**Motivo:** el Documento de Especificación Funcional define "Perfil de
Recurso" como una única entidad que, según el `tipo`, cumple el
rol que en Personas es el Rol y en Maquinarias es la Clasificación — y
que debe ser **configurable por Mandante** (mismo criterio que ya existe
para Perfil de Participación), no un catálogo fijo igual para todos.

Colección raíz: `perfilesRecurso`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| perfilRecursoId | string | Sí | ID del documento (autogenerado) |
| mandanteId | string (ref) | Sí | Cada Mandante tiene su propio catálogo |
| tipo | string | Sí | `"persona" \| "recurso"` — inmutable después de creado |
| nombre | string | Sí | Ej: "Operador", "Grúa". Único por (mandanteId, tipo) |
| estado | string | Sí | `"activo" \| "inactivo"` (nunca eliminación física) |
| createdAt / updatedAt | timestamp | Sí | Auditoría estándar |

Capas implementadas replicando EXACTAMENTE el patrón de Perfil de
Participación: `perfilRecursoRepository.js` / `Service.js` /
`Controller.js` / `Routes.js`, con `_aplicarScopeActor()` forzando
`mandanteId` para `mandante_admin`/`mandante_lector`, lectura para
`["superadmin","mandante_admin","mandante_lector","evaluador"]` y
escritura solo para `["superadmin","mandante_admin"]`.

Índices compuestos agregados a `firestore.indexes.json` (colección
nueva, sin índices previos): las 7 combinaciones no vacías de
`{mandanteId, tipo, estado}` × `orderBy(createdAt)` — mismo
criterio de la auditoría de índices de Perfil de Requerimiento (los tres
filtros son independientes entre sí, `list()` los combina libremente).
La consulta puntual de validación (`getActivoByNombre`, usada por
Asignación y Requerimiento) es de pura igualdad sin `orderBy` — no
requiere índice compuesto.

**Conflicto de diseño resuelto ANTES de implementar (no se decidió
unilateralmente — se consultó explícitamente):** Recurso (y también
Requerimiento) es un catálogo global sin `mandanteId` propio (RN-021):
una misma Empresa —y por lo tanto sus Recursos— puede aportar a
Proyectos de Mandantes distintos, así que un Recurso no tiene un único
Mandante "dueño" contra el cual scopear la validación de su campo
`tipo` en el momento en que se crea o edita (`/recursos/nuevo` es una
ruta standalone, sin Proyecto ni Mandante de contexto). Se resolvió así:

- **`Recurso.tipo`** ya NO se valida contra un catálogo al
  crear/editar el Recurso — queda como texto libre (igual que antes),
  con `recursoService.listarTiposDisponibles()` ahora sugiriendo la
  UNIÓN de los Perfiles de Recurso activos (`tipo: "recurso"`)
  de CUALQUIER Mandante, más los personalizados ya en uso.
- La validación estricta se aplica recién en
  `asignacionService.crearAsignacion`, al asignar el Recurso a un
  Proyecto: ahí el `mandanteId` SÍ se deriva limpio del Proyecto (mismo
  mecanismo que ya existía para el `rol` de una Persona). Se rechaza la
  Asignación si `recurso.tipo` no corresponde a un Perfil de Recurso
  activo de ese Mandante.
- **`rol` de Persona** sigue el mismo mecanismo que ya tenía (se valida
  en `asignacionService.crearAsignacion`, nunca en Persona), solo que
  ahora contra Perfil de Recurso en vez del array `ROLES_VALIDOS` fijo.
- **`Requerimiento.rolAplicable`** tiene el MISMO problema (Requerimiento
  también es catálogo global, sin mandanteId) y no tiene un punto
  análogo a Asignación donde recién ahí se le pueda derivar un
  mandanteId — se resolvió aceptando cualquier rol activo de
  CUALQUIER Mandante (unión global), igual que la sugerencia de
  `Recurso.tipo`. Esto no estaba en el pedido original; se detectó al
  auditar todos los consumidores de `ROLES_ASIGNACION` antes de borrar
  el catálogo (`requerimientoService._validarRolAplicable`).

**Migración (`functions/src/scripts/migrarPerfilesRecurso.js`,
backfill, no recuperación histórica):** por la misma razón de arriba
(Recurso no tiene mandanteId, no hay "el Mandante que usa este tipo
personalizado"), el backfill de los 4 roles fijos + 7 tipos fijos + los
tipos personalizados detectados en uso se replica en TODOS los
Mandantes existentes, no solo en uno — así ninguna Asignación o Recurso
con un valor histórico queda inválida al asignarse a cualquier
Mandante. `nombre` se backfillea con el valor EXACTO ya almacenado
(minúsculas, ej. "camion_pluma") para no romper la validación contra
Asignaciones/Recursos ya creados; un mandante_admin puede renombrar
después vía el CRUD sin afectar datos existentes (solo condiciona
Asignaciones nuevas). Dry-run por defecto, requiere `--ejecutar`, usa
`serviceaccountkey.json` (minúsculas).

**Catálogos fijos eliminados:** `ROLES_ASIGNACION` (frontend y backend,
`asignacionService.js`) y `TIPOS_RECURSO` (frontend y backend,
`recursoService.js`). El frontend ya no mantiene una copia espejada a
mano — todos los selects relevantes (`ProyectoDetailPage.jsx`,
`PasoAsignaciones.jsx`, `RequerimientoFormPage.jsx`,
`RecursoFormPage.jsx`) consumen `perfilRecursoService`/
`recursoService.listarTipos()` en tiempo real. Los usos puramente de
DISPLAY (mostrar el `rol`/`tipo` ya guardado en una Asignación/Recurso
existente) usan `frontend/src/utils/formatCatalogo.js`, un formateador
cosmético (title-case) en vez de un mapa de labels — no hay ida y
vuelta, nunca se usa para comparar ni para enviar de vuelta al backend.

**Frontend:** nueva página de administración "Perfiles de Recurso"
(`/perfiles-recurso`, menú Administración) con el mismo patrón CRUD que
Perfiles de Participación — lista con filtros (Mandante/Aplica a/Estado)
+ formulario, scoped al Mandante del usuario logueado o con selector de
Mandante para superadmin. Sin página de detalle ni vista agrupada (no
pedidas, para mantener el alcance acotado).

---

## Entidad 19 — RelaciónRecurso (Empresa ↔ Recurso)

> **Reemplazada por el Bloque 3** (ver "Relaciones de Empresa" al final): la colección `relacionesRecurso` y los campos denormalizados en el documento ya no existen.

**Agregada:** cierre del mismo gap que ya se había resuelto para Persona
(entidad 17) pero que quedó pendiente para Recurso — `recursoService.
actualizarRecurso` permitía sobreescribir `empresaId` directamente, sin
transacción, sin registrar la Empresa anterior y sin dejar rastro en
Bitácora de cuándo un Recurso cambió de dueño/operador.

**Motivo:** mismo razonamiento que RelaciónLaboral, aplicado a Recurso:
separar el vínculo con una Empresa (con su propio historial, RelaciónRecurso)
del campo plano `Recurso.empresaId`, que antes se sobreescribía sin dejar
rastro de la Empresa anterior ni de cuándo cambió. Replica EXACTAMENTE el
patrón ya usado y probado en RelaciónLaboral — no es un diseño nuevo.

Colección raíz: `relacionesRecurso`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| relacionRecursoId | string | Sí | ID del documento (autogenerado) |
| recursoId | string (ref) | Sí | Referencia a `recursos` |
| empresaId | string (ref) | Sí | Referencia a `empresas` |
| tipoRelacion | string | Sí | Texto libre. Ej: "Propietario", "Arrendatario" |
| fechaInicio | timestamp | Sí | Inicio de la relación |
| fechaTermino | timestamp | No | Solo si `estado = "finalizada"` |
| estado | string | Sí | `"activa" \| "finalizada"` |
| createdAt / updatedAt | timestamp | Sí | Auditoría estándar |

Mismo criterio que RelaciónLaboral: catálogo global, **sin mandanteId**
(Recurso ya es catálogo global sin mandanteId propio — RN-021 — sería
inconsistente que su relación con Empresa sí lo tuviera). Capas
implementadas calcando `relacionLaboralRepository.js`/`Service.js`:
`relacionRecursoRepository.js`/`relacionRecursoService.js`, con los
mismos métodos (`getRelacionRecursoById`, `listarPorRecurso`,
`crearRelacionInicial`, `cambiarEmpresa`) adaptados a que Recurso no
tiene cargo/tipoContrato/jornada — solo `tipoRelacion`.

**Reglas de negocio:**
- **RN-122** — Un Recurso solo puede tener UNA RelaciónRecurso con
  `estado = "activa"` a la vez. Garantizado por construcción dentro de la
  transacción de `cambiarEmpresa` (nunca dos escrituras separadas que
  puedan dejar el estado inconsistente).
- **RN-123** — Todo cambio de Empresa activa se registra en Bitácora
  (`entidad: "recurso"`, `accion: "cambio_empresa"`), con Empresa
  anterior y nueva. "Cambiar Empresa"
  (`relacionRecursoService.cambiarEmpresa`) ejecuta, en una única
  transacción de Firestore: (1) cierra la RelaciónRecurso activa actual
  (`estado: "finalizada"`, `fechaTermino: ahora`), (2) crea la nueva
  RelaciónRecurso activa, (3) actualiza el denormalizado en Recurso
  (`empresaId`/`empresaActivaId`). NO modifica ni elimina Asignaciones a
  Proyectos existentes — el historial de participación en Proyectos no
  se reescribe (mismo criterio que RN-063 de Persona).

**Cambios a Recurso:**
- Se agrega el campo denormalizado `empresaActivaId`, mantenido
  EXCLUSIVAMENTE por `relacionRecursoService` (nunca editable vía
  `recursoService.actualizarRecurso` — queda fuera de su `allowedFields`
  a propósito). Recurso no tiene un campo equivalente a `cargoActivo` de
  Persona (no hay dato análogo que denormalizar).
- El campo `empresaId` original de Recurso se mantiene (no se elimina,
  por la enorme cantidad de código existente que ya lo referencia,
  incluyendo `acreditacionService._reemplazarPersonaOMaquinaria`), pero
  pasa a mantenerse en sincronía con `empresaActivaId` en cada cambio de
  empresa — en la práctica ambos quedan siempre iguales.
- A diferencia de Persona, se decidió (consultado explícitamente antes de
  implementar) que `tipoRelacion` sea un campo **obligatorio explícito
  del formulario** de creación de Recurso (`RecursoFormPage.jsx`), sin
  valor por defecto asumido — para no dejar un dato incorrecto sin que
  nadie lo note (ej. asumir "Propietario" cuando en realidad el Recurso
  es arrendado).
- `recursoService.actualizarRecurso` rechaza explícitamente (400) un
  intento de cambiar `empresaId` distinto al actual, con el mensaje "Para
  cambiar la Empresa de un Recurso, use 'Cambiar Empresa'." — a
  diferencia de Persona, que simplemente ignora el campo si llega
  (`empresaId` fuera de `allowedFields`), acá se prefirió el rechazo
  explícito para no confundir a quien todavía no sepa del nuevo flujo.

**Migración (`functions/src/scripts/migrarRelacionesRecurso.js`,
backfill, no recuperación histórica real):** el modelo anterior de
Recurso nunca tuvo un campo `tipoRelacion` con su Empresa — se verificó
contra el código antes de escribir la migración. Crea una
RelaciónRecurso activa por cada Recurso preexistente usando su
`empresaId` ya existente, con `tipoRelacion` en placeholder ("No
especificado") porque ese dato nunca se capturó. Dry-run por defecto,
requiere `--ejecutar`, usa `serviceAccountKey.json`.

**Frontend:** `RecursoDetailPage.jsx` gana un botón "Cambiar Empresa" (en
la pestaña "Información General", junto a "Datos Generales") y una nueva
pestaña "Historial de Empresas" con la tabla de todas las
RelacionRecurso (Empresa, Tipo de Relación, fechas, estado) — mismo
patrón visual que "Empresa Activa"/"Historial de Empresas" en
`PersonaDetailPage.jsx`, adaptado al layout con pestañas que ya usa
`RecursoDetailPage.jsx` en vez de un scroll único. `RecursoFormPage.jsx`
solo muestra el bloque "Empresa" (con su `tipoRelacion` inicial) en modo
creación, igual que `PersonaFormPage.jsx` — en edición, la Empresa activa
se cambia únicamente desde "Cambiar Empresa" en el detalle. Nuevo
`relacionRecursoService.js` en `frontend/src/services/`, mismo patrón
que `relacionLaboralService.js`, contra los endpoints anidados
`GET /recursos/:id/relaciones` y `POST /recursos/:id/cambiar-empresa`
(a diferencia de RelaciónLaboral, que vive en su propio recurso HTTP de
nivel superior `/relaciones-laborales` — para RelaciónRecurso se prefirió
anidarlo bajo `/recursos` porque no se justificaba un recurso HTTP propio
para una entidad que solo se consulta/modifica en el contexto de un
Recurso puntual).

**Limitación conocida (heredada del mismo patrón ya visto en Persona/
Requerimiento):** Recurso es un catálogo global sin `mandanteId`, así que
los eventos de bitácora de `cambio_empresa` quedan con `mandanteId: null`
— visibles para superadmin/evaluador, pero invisibles para
mandante_admin/mandante_lector en su feed de bitácora filtrado por
mandanteId. No se resolvió en esta entrega (requeriría repensar cómo la
bitácora trata entidades globales).

---

## Principio de diseño — Gramática compartida de las pantallas de Detalle

**Decisión:** las pantallas de Detalle de las entidades principales
(Proyecto, Empresa, Persona, Maquinaria, Participación, Expediente) siguen
una misma gramática visual. Lo único que cambia entre entidades es **a qué
relaciones apunta cada pestaña** — cada entidad se relaciona con cosas
distintas, así que los nombres de pestaña no se copian de una a otra sin
traducirlos a la relación real.

**Qué es común (se reutiliza, no se reescribe):**
- Encabezado: botón volver, nombre + identificador secundario, badge de
  estado y acción "Editar" (solo roles de escritura).
- Franja de KPIs superior (tarjetas de un solo número, combinadas de dos
  valores para Personas/Maquinarias, y donut de Cumplimiento).
- Shell de pestañas: `components/shared/Tabs.jsx`.
- Tarjetas de información y panel lateral con el mismo estilo.
- "Últimos Eventos" e "Historial": `components/shared/EventosBitacora.jsx`
  (`UltimosEventos`/`HistorialEventos`), alimentados por un único mecanismo
  de backend, `bitacoraService.listarPorReferencias` (que usa
  `bitacoraRepository.listPorReferencias`). Cada entidad solo arma su lista
  de referencias `{entidad, entidadId}`: Proyecto = él mismo + sus
  Participaciones + sus Expedientes; Empresa = ella misma + sus
  Participaciones + sus Asignaciones.
- Tabla de Empresas Participantes
  (`components/proyectos/EmpresasParticipantesTable.jsx`) y lista de
  Requerimientos (`components/shared/RequerimientosLista.jsx`), con distintos
  datos de entrada según la pantalla.
- Cumplimiento: siempre `reporteService._calcularAvanceRequerimientos`; nunca
  un cálculo paralelo.

**Qué cambia por entidad (las pestañas):**
- **Proyecto:** Resumen | Empresas Participantes | Recursos | Requerimientos |
  Documentación | Historial. Documentación agrega las Evidencias de los
  Expedientes del Proyecto (no existe un "documento de Proyecto" propio).
- **Empresa:** Resumen | Mandantes | Proyectos | Recursos | Documentación |
  Historial. Documentación es un placeholder ("Aún no hay documentos a nivel
  Empresa") porque no hay una fuente de documentos a nivel Empresa todavía.

**Regla para las pantallas pendientes (Persona, Maquinaria, Participación,
Expediente):** se abordan una por una en prompts futuros, partiendo de esta
gramática. Antes de nombrar las pestañas, definir las relaciones reales de la
entidad (p. ej. Persona: Empresas/Relaciones laborales, Proyectos y
Asignaciones, Requerimientos, Documentos, Historial). Si una pestaña no tiene
una fuente de datos real, se deja vacía con su mensaje, sin simular datos ni
inventar un modelo nuevo.

**Nota (limitación conocida):** el Detalle de Empresa cuenta un solo
mecanismo de eventos, pero las entidades de catálogo global sin `mandanteId`
(Empresa, Persona, Recurso) registran eventos con `mandanteId: null`, que un
`mandante_admin`/`mandante_lector` no ve en su feed filtrado por Mandante.
Hoy la bitácora no registra eventos de la propia Empresa; los que se ven vienen
de sus Participaciones y Asignaciones, que sí llevan `mandanteId`.

**Actualización — Persona y Maquinaria ya siguen esta gramática.**
Ambas usan `components/shared/DetalleEntidadLayout.jsx` (encabezado + franja
de 5 KPIs + `Tabs` + panel lateral **visible en todas las pestañas**) y
`components/shared/DetalleUI.jsx` (`KpiCard`, `KpiValor`, `KpiAnillo`,
`TarjetaPanel`, `CampoInfo`), que también usan ahora Empresa y Proyecto.
- **Persona:** Resumen | Empresas | Proyectos | Documentación | Historial.
  "Mandantes" y "Proyectos" son tarjetas KPI, no pestañas: esas agregaciones
  tienen sentido para Empresa/Proyecto, no para un individuo. KPIs:
  Acreditación (sobre el Expediente abierto de su Asignación más reciente),
  Mandantes distintos, Proyectos activos, Empresa, y Cumplimiento (promedio del
  % de cada Participación activa; las que no tienen nada evaluable no entran
  al promedio). Empresas = Empresa Activa + Historial (con "Cambiar Empresa");
  Proyectos = Proyectos Actuales + Historial de Participaciones + Requerimientos
  de nivel Persona (con "Cambiar Proyecto" y "Reemplazar Acreditación").
- **Maquinaria:** mismas 5 pestañas y KPIs; "Rol" pasa a "Clasificación"; los
  datos propios (Patente, Marca, Modelo, Año) van en el panel lateral "Datos de
  la Maquinaria"; Documentación incluye los Requerimientos de nivel
  Maquinaria y sus Mantenciones. Empresas usa RelaciónRecurso (ya construida).
- **Documentación** de Persona es un placeholder ("Aún no hay documentos a
  nivel Persona"): las Evidencias cuelgan del Expediente, no de la Persona.
- **Historial:** un solo mecanismo, `bitacoraService.listarPorReferencias`
  (Persona/Recurso = él mismo + sus Asignaciones + las Participaciones a las que
  pertenecen), servido por `GET /personas/:id/eventos-recientes` y
  `GET /recursos/:id/eventos-recientes`. Limitación heredada: los eventos de
  Persona/Recurso (catálogo global) llevan `mandanteId: null`, así que un rol de
  Mandante no los ve; sí ve los de sus Asignaciones y Participaciones.
- **Pendientes:** Participación y Expediente. Empresa y Proyecto todavía tienen
  su propio shell (su panel lateral solo aparece en Resumen); migrarlas a
  `DetalleEntidadLayout` sería un cambio de diseño aparte.

---

## Patrón definitivo — Detalle con edición in-place

**Decisión (reemplaza la separación Detalle / Editar de Empresa y Proyecto):** las
entidades principales (Proyecto, Empresa, Persona, Maquinaria — y en el futuro
Participación y Expediente) tienen **una sola pantalla de Detalle con pestañas**
que activa la edición **in-place** al presionar "Editar", en vez de navegar a un
formulario aparte. Mientras `modoEdicion` está activo, el encabezado cambia
"Editar" por "Cancelar" / "Guardar Cambios", y cada pestaña habilita sus propios
controles de gestión; al Guardar o Cancelar vuelve a solo lectura. La pestaña
Historial es siempre de solo lectura (la Bitácora no se edita).

**Estado de la migración:**
- **Proyecto: hecho.** `ProyectoDetailPage` con `modoEdicion`. El formulario vive
  en `components/proyectos/ProyectoEdicionForm.jsx` (Información General, Fechas y
  cronograma, Configuración adicional, sidebar Estado del Proyecto / Acciones
  Rápidas) y se muestra en Resumen mientras se edita. `ProyectoFormPage` queda solo
  para **crear**; `/proyectos/:id/editar` redirige a `/proyectos/:id?editar=1`.
- **Empresa, Persona y Maquinaria: hecho.** Mismo patrón, con el hook compartido
  `hooks/useEdicionInPlace.js` (modo edición, cambios sin guardar, ?editar=1) y los
  botones `components/shared/BotonesEdicion.jsx`, que Proyecto también usa. Cada
  entidad extrajo su formulario de datos identitarios a un componente
  (`EmpresaEdicionForm`, `PersonaEdicionForm`, `RecursoEdicionForm`) que se muestra
  en Resumen mientras se edita; su `XFormPage` quedó solo para **crear** y
  `/x/:id/editar` redirige al detalle con la edición activada.
  - Persona y Maquinaria: "Cambiar Empresa", "Cambiar Proyecto" y "Reemplazar
    Acreditación" pasaron a mostrarse solo en modo edición.
  - Las acciones de evaluación (Empresa/Persona: "Evaluar") NO se restringen al modo
    edición: las hace el rol evaluador, que no tiene edición.
  - Empresa solo edita sus datos identitarios; agregar/finalizar Participaciones
    desde la Empresa no existe todavía (sí desde el Proyecto).

**Cómo se comporta la edición en Proyecto:**
- *Resumen:* el formulario; "Guardar Cambios" (encabezado) lo persiste. Es lo único
  que se guarda en lote; "Cancelar" descarta sus cambios.
- *Empresas Participantes:* "+ Agregar Empresa" (crea la Participación y su
  Expediente, igual que el wizard) y "Finalizar Participación" por fila.
- *Recursos:* "+ Nueva Asignación" (búsqueda + alta al vuelo) y "Quitar" (finaliza
  la Asignación) por fila.
- *Requerimientos:* la misma planilla de evaluación de `EvaluarExpedientePage`,
  extraída a `components/expedientes/PlanillaEvaluacion.jsx` y embebida por Empresa,
  Persona y Maquinaria.
- *Documentación:* "Subir documento" (`evidenciaService.subirYVincular`, el mismo
  flujo que el Expediente).
- Las acciones de gestión de estas pestañas **se aplican al instante** (cada una
  llama a su endpoint) y las terminales piden confirmación; no se acumulan hasta
  "Guardar Cambios", por lo que "Cancelar" no las deshace.
- Con cambios sin guardar en el formulario se avisa al salir (cerrar la pestaña,
  volver, o hacer clic en un enlace interno).

**Fuera de alcance por no existir en el backend** (agregarlos requiere definir
reglas de negocio nuevas): "Editar Perfil" de una Participación (cambiar el Perfil
altera los Requerimientos del Expediente) y "Cambiar rol" de una Asignación. Hoy
Participación y Asignación solo admiten crear y transicionar de estado.


---

## Desviación — Evidencia documental opcional y Estado de Expediente derivado

**Registrada:** 2026-09-25, confirmada por Raúl (metodoVerificacion estructurado;
ciclo GAP colapsado en un solo estado).

**Desviación respecto a la especificación original** (Doc. 1 RN-033 y Doc.
Arquitectura Funcional Cap. 1: *"SmartOne no almacena evaluaciones;
administra evidencia de cumplimiento"*): existen escenarios reales
(verificación presencial/verbal en terreno) donde un Requerimiento se evalúa
**sin evidencia documental adjunta**. El modelo anterior asumía el flujo
secuencial obligatorio *subir documentos → evaluar* y dejaba al Expediente
"atascado" en su estado inicial cuando se evaluaba sin documentos.

### 1. Evidencia opcional por Evaluación (`metodoVerificacion`)
- Nuevo campo en `evaluaciones`: `metodoVerificacion` = `"documental" |
  "presencial" | "otro"` (null en "pendiente" y en Evaluaciones anteriores a
  este cambio).
- Si el sujeto (Empresa/Persona/Recurso) tiene evidencia activa adjunta al
  Requerimiento, el método es `documental` (implícito). Sin evidencia se
  exige `presencial` u `otro` **y** una justificación (`observaciones`) no
  vacía. `documental` sin evidencia se rechaza. Las Evaluaciones
  `reutilizada` heredan el método de la original.
- Motivo de que sea un campo estructurado y no solo texto libre: una
  Evaluación respaldada por documento y una verificada de palabra no deben
  pesar igual en reportes/auditorías futuras.

### 2. Estado del Expediente derivado (`calcularEstadoDerivado`)
Estados: `creado`, `en_revision`, `con_observaciones`, `aprobado`,
`en_ejecucion`, `cerrado`. Se calculan solos, sobre los pares Requerimiento ×
sujeto aplicables (empresa: 1; persona: una por Persona asignada con rol
coincidente; maquinaria: una por Recurso asignado):
- ninguno evaluado → `creado`
- algunos sin evaluar → `en_revision`
- todos evaluados con algún "No Cumple" → `con_observaciones`
- todos evaluados sin "No Cumple" → `aprobado`

Se recalcula tras cada cambio que pueda moverlo (crear Evaluación,
agregar/quitar Requerimiento, crear/finalizar/mover Asignación, crear
Expediente con Evaluaciones reutilizadas). El valor se **persiste** en
`expedientes.estado` (para filtros/listados) — pero ya no se transiciona a
mano. Migración: `functions/src/scripts/migrarEstadoExpedienteDerivado.js`
(conserva el valor anterior en `estadoMigradoDesde`).

### 3. "Preparación Documental" deja de ser un estado
Se reemplaza por un indicador **paralelo** en el Detalle de Expediente: % de
pares Requerimiento × sujeto con evidencia documental adjunta (independiente
del % evaluado). Un Expediente puede estar `aprobado` con 3 de 10 sin
documento.

### 4. Transiciones que siguen siendo manuales
- `aprobado → en_ejecucion` (además de la Inducción HSEQ, dato que no vive en
  Evaluación) y `en_ejecucion → cerrado` (decisión administrativa).
- La derivación **nunca** pisa `en_ejecucion` ni `cerrado`.

### 5. Ciclo GAP colapsado
`en_correccion` y `reevaluacion` desaparecen: mientras exista algún "No
Cumple" el Expediente está en `con_observaciones` y sale solo al corregir el
último. (El timeline del Detalle lo muestra como desvío ⟲ de "En Revisión".)

> Documented deviation: Evidencia documental es opcional por Evaluación
> (antes obligatoria según Doc. Arquitectura Funcional Cap. 1) — se permite
> evaluación verificada presencialmente/verbalmente, con `metodoVerificacion`
> y justificación obligatoria en su lugar. Estado de Expediente pasa de manual
> a derivado/calculado en base al estado real de las evaluaciones.

## Bloque 3 — Relaciones de Empresa (empresaPersonas, empresaRecursos, empresaMandantes)

- **empresaPersonas** {empresaId, personaId, tipoRelacion, cargo, tipoContrato, jornada,
  fechaInicio, fechaTermino, estado} y **empresaRecursos** {empresaId, recursoId, tipoRelacion,
  fechaInicio, fechaTermino, estado} son la única fuente de la Empresa actual (y del cargo actual
  de la Persona). Persona y Recurso ya no guardan empresa ni cargo. Una sola relación activa por
  sujeto; terminar fija `fechaTermino` y `estado: "finalizada"`, sin borrado (historial).
- **empresaMandantes** {empresaId, mandanteId, estado}: un único documento por par (id
  determinístico); desasociar lo deja `inactivo`. Crear una Participación exige el vínculo activo;
  no se desasocia con Participaciones activas en Proyectos de ese Mandante.
- **empresasRut** (RUT → empresaId) se escribe en la misma transacción que la Empresa: dos altas
  simultáneas con el mismo RUT no pueden tener éxito ambas. RUT existente → 409 `RUT_EXISTENTE` y
  se ofrece asociar la Empresa existente.
- Alcance: superadmin y evaluador ven todo; los roles de Mandante ven las Empresas asociadas a su
  Mandante y las Personas/Recursos con cualquier relación (vigente o histórica) con ellas, y en el
  detalle solo las relaciones con Empresas de su alcance. admin_comercial: Empresas y
  empresaMandantes; sin acceso a Personas ni Recursos.
- Asignar a una Participación exige relación activa con su Empresa. Terminar/cambiar una relación
  con asignaciones activas pide confirmación (409 `CONFIRMACION_REQUERIDA`) y luego las finaliza;
  un rol de Mandante no puede hacerlo si alguna es de otro Mandante (403 `FUERA_DE_ALCANCE`, sin
  revelar datos).
- Patente de Maquinaria obligatoria y no única (aviso `PATENTE_DUPLICADA` con confirmación).

## Bloque 4 — expedienteRequerimientos, evidencias y evaluaciones

- **expedienteRequerimientos**: cada Requerimiento concreto (este Requerimiento, para este sujeto,
  en este Expediente) es un documento con ID determinístico `expedienteId_requerimientoId_sujetoId`.
  Lleva la copia congelada del Requerimiento (nombre, nombreCorto, requiereVencimiento,
  esDocumentoIdentidad, orden), `origen` ("configuracion" | "agregado_manual"), `estado`
  ("activo" | "retirado", nunca se borra) y la copia de la evaluación vigente (resultado,
  evaluacionVigenteId, fechaVencimiento), escrita en la misma transacción que la evaluación.
- **expedientes**: sin array de requerimientos. Cabecera con `estadoGeneracion`
  ("en_proceso" | "completa"), `creadoPorId`, `requerimientosManuales` (reglas
  {requerimientoId, tipoEntidad}) y contadores `resumen` / `resumenSujetos`
  ({activas, cumple, noCumple, noAplica, pendiente}; una instancia sin evaluar cuenta como
  pendiente), actualizados con incrementos en cada evaluación y en cada lote de generación o
  sincronización; `recalcularResumen` los rehace desde cero (al terminar la generación y para
  reparar).
- **Generación y sincronización** (`expedienteRequerimientoService`, único usuario de la regla de
  aplicabilidad junto con las vistas previas): lotes de hasta 400 operaciones, idempotente,
  reintentable. Crea las que faltan (con reutilización documental), reactiva las retiradas que
  vuelven a aplicar y retira las que dejan de aplicar. Corre al crear el Expediente, al asignar o
  finalizar sujetos o perfiles, al cambiar vínculos del Perfil y al agregar o quitar reglas
  manuales. Los Expedientes cerrados no se tocan.
- **% de cumplimiento** = cumple / (activas − noAplica); "—" si el denominador es 0. El estado
  derivado conserva sus reglas sobre las instancias activas.
- **evaluaciones**: `expedienteRequerimientoId` obligatorio; estados "vigente" | "reemplazada" |
  "anulada". Las reutilizadas llevan `evaluacionOrigenId`.
- **Evidencia opcional**: "cumple" sin evidencia exige método (presencial/otro) y justificación;
  "no_cumple" / "no_aplica" sin evidencia no los exigen. "cumple" de un requisito con vencimiento
  exige fecha. `evidenciaRequerimientos` enlaza la evidencia a la instancia (y por lo tanto al
  sujeto).

## Bloque 5 — Tareas y pendientes de UI (planilla del 06.10.2026)

- **Código de Proyecto automático**: `PRJ-AAAA-NNN` (año de creación en hora de Chile; el
  correlativo crece a 4 dígitos si hace falta), correlativo **por Mandante y año**. Lo asigna
  `proyectoRepository.createConCodigo` en la misma transacción que crea el Proyecto, con el
  contador `contadoresProyecto/{mandanteId}_{anio}` ({mandanteId, anio, ultimo}). El contador se
  crea con el primer Proyecto de ese par y parte del mayor correlativo ya usado por ese Mandante
  en ese año (los Proyectos existentes conservan su código). Si dos altas crean el contador a la
  vez, una falla con ALREADY_EXISTS y el servicio reintenta. El backend ignora un `codigo` enviado
  por el cliente, al crear y al editar. `GET /proyectos/siguiente-codigo` queda sin uso (se
  conserva hasta decidir si se elimina).
- **Persona.profesion**: texto opcional (máx. 80); no se muestra en el listado; se borra al
  anonimizar.
- **`GET /empresas/:id/recursos`**: Personas y Maquinarias con relación (vigente o histórica) con
  la Empresa, una fila por sujeto (su relación más reciente) con sus Proyectos de asignación
  activa por esa Empresa; lecturas por lote (`getByIds` con `db.getAll`), sin consulta por fila.
  Un rol de Mandante solo ve Proyectos de su Mandante. Sin admin_comercial (403).
- **Bitácora — Mandante de contexto** (`alcanceMandante.mandanteDeContexto`): para acciones sobre
  entidades sin `mandanteId` (alta y edición de Persona/Maquinaria, cambio de empresa, término de
  relación) se registra el del actor; si no tiene, el de las asignaciones afectadas (si son de un
  solo Mandante) o el único Mandante asociado a la Empresa. Queda null solo si no se puede derivar
  sin ambigüedad (acción global de un rol transversal) y en la anonimización (acción global).
- **UI**: menú lateral retráctil con secciones Inicio / Operación / Maestros / Configuración /
  Administración (preferencia por usuario en localStorage); campos de formulario de 2 opciones
  como radio (`OpcionesRadio`); listados sin paneles laterales.

## Requerimientos por Mandante (catálogo con modal de ingreso continuo)

- **Modelo**: `requerimientos` agrega `mandanteId` (obligatorio e inmutable, igual que
  `tipoEntidad`). Deja de ser un catálogo global. `perfilRequerimientos` no cambia de estructura;
  el Requerimiento, el Perfil de Participación y el Perfil de Recurso deben ser del mismo Mandante
  y el tipo del Perfil de Recurso debe coincidir con el `tipoEntidad`.
- **Aplicabilidad**: `{ perfilParticipacionIds: [...], perfilRecursoIds: null | [...] }` (null =
  "Todos"; para Empresa siempre null). Es del Requerimiento: un vínculo por cada combinación.
  No se guarda en el documento del Requerimiento: son sus vínculos activos.
- **Guardado atómico**: `POST /requerimientos` y `PUT /requerimientos/:id` escriben el
  Requerimiento, su índice de nombre y sus vínculos en UNA transacción
  (`requerimientoRepository.guardarAtomico`). Un Requerimiento nunca queda sin vínculos. Editar
  ajusta los vínculos por diferencia (crea, desactiva, no toca los que se mantienen; sin borrado).
  Después se sincronizan los Expedientes abiertos (regla del bloque 4). Sin `DELETE`: el estado se
  cambia editando. Eliminados `DELETE /requerimientos/:id`, `GET /requerimientos/uso` y
  `POST /perfil-requerimientos`.
- **Unicidad**: índice `requerimientosNombre`, ID `<mandanteId>|<tipoEntidad>|<nombre
  normalizado>` (minúsculas, sin tildes, trim, espacios colapsados; "/" se guarda como "%2F"
  porque no puede ir en un ID). La clave se ocupa solo mientras el Requerimiento está activo:
  renombrar libera la anterior y toma la nueva; desactivar la libera; reactivar la vuelve a tomar
  o responde 409.
- **Alcance**: `GET /requerimientos` exige `mandanteId` para superadmin y evaluador; los roles de
  Mandante quedan fijos en el suyo (404 para Requerimientos de otro). La matriz del Perfil, las
  reglas manuales de Expediente y los cálculos de aplicables solo consideran los Requerimientos
  del Mandante.
- **Reutilización documental**: nunca entre Mandantes. `buscarReutilizables*` recibe el
  `mandanteId` del Expediente destino y filtra las Evaluaciones por él.
- **Bitácora**: crear, editar y cambiar el estado de un Requerimiento quedan registrados con
  `mandanteId` (entidad "requerimiento").
- **Migración**: `scripts/migrarRequerimientosAMandante.js` (dry-run por defecto).

## Fechas: dd/mm/aaaa en toda la aplicación

- Un solo módulo por app: `frontend/src/utils/fechas.js` y `mobile/src/utils/fechas.js`
  (`formatFecha`, `formatFechaHora`; en web además `parseFechaDMA`, `aFechaISO`, `hoyISO`,
  `sumarDiasISO`, `formatTiempoRelativo`). Sin librerías. No se usa `toLocaleDateString` ni
  `<input type="date">` en ninguna pantalla.
- Fechas sin hora (inicio, término, vencimiento): viajan como "aaaa-mm-dd" y el backend las guarda
  como medianoche UTC. Se muestran con sus componentes UTC, así el día no cambia en Chile. Un
  Timestamp exactamente en medianoche UTC se trata como fecha sin hora.
- Instantes (createdAt, bitácora): se muestran en America/Santiago, en 24 horas. "Hoy" también se
  calcula en America/Santiago.
- Ingreso: `components/ui/DateInput.jsx` (texto con máscara dd/mm/aaaa + calendario propio en
  español). `value` / `onChange` siguen en "aaaa-mm-dd": los payloads no cambiaron.

## Perfil de Recurso: nombre único y reactivación

- El nombre es único por Mandante y tipo, comparado normalizado (minúsculas, sin tildes, trim,
  espacios colapsados) y entre perfiles activos e inactivos. Al crear con un nombre que ya existe,
  `POST /perfiles-recurso` responde 409 con `codigo: "PERFIL_EXISTENTE"` y
  `detalle: { perfil: { id, nombre, tipo, estado }, cantidadRequerimientos }`.
- Un perfil inactivo se reactiva con `PUT /perfiles-recurso/:id` (`{ estado: "activo" }`); sus
  vínculos de perfilRequerimientos no se tocan y vuelven a aplicar. El estado de un Perfil de
  Recurso no entra en el cálculo de requerimientos aplicables, así que ni desactivar ni reactivar
  sincroniza Expedientes.
- El formulario (modal y página) avisa el nombre repetido mientras se escribe y ofrece usar el
  perfil existente, reactivarlo o elegir otro nombre.

## Ejecución y cierre de Expedientes, alertas e historial de estados

- Fase de evaluación (automática, como antes): creado / en_revision / con_observaciones /
  aprobado se recalculan desde los contadores al cambiar evaluaciones o instancias.
- `aprobado → en_ejecucion` es manual ("Iniciar ejecución", `POST /expedientes/:id/iniciar-ejecucion`):
  exige estado aprobado y un Proyecto que no esté finalizado, archivado ni suspendido; fija
  `fechaInicioEjecucion`. En ejecución el estado ya no se recalcula: los vencidos, pendientes o
  "no cumple" se muestran como alerta (banner en el detalle e ícono en el listado, desde `resumen`).
- Cierre (`POST /expedientes/:id/cerrar { motivo, detalle }`), desde cualquier estado salvo
  cerrado. Motivos: fin_proyecto, salida_empresa, cierre_administrativo, otro (exige detalle). En
  una transacción fija `fechaCierre`, `motivoCierre` y `detalleCierre`, finaliza la Participación y
  sus participacionPersonas / participacionRecursos activos (fechaTermino hoy). No borra nada.
- RN-014: al pasar un Proyecto a finalizado o archivado se cierran sus Expedientes abiertos
  (motivo fin_proyecto, origen automático), uno por transacción; los ya cerrados se saltan, así
  que reintentar no duplica (`POST /proyectos/:id/cerrar-expedientes`).
- Reemplazar Acreditación / Cambiar Proyecto cierran el Expediente anterior con motivo
  cierre_administrativo y su registro de historial.
- Correcciones, solo superadmin y con motivo: `volver-a-aprobado` (en_ejecucion → aprobado, borra
  `fechaInicioEjecucion` y retoma el recálculo) y `reabrir` (al estado previo al último cierre
  según el historial; sin historial, el que dan las evaluaciones). Reabrir NO reactiva la
  Participación ni las asignaciones finalizadas.
- Permisos: iniciar y cerrar, superadmin y mandante_admin (este acotado a su Mandante). Se quitó
  a evaluador de las transiciones (sigue pudiendo agregar o quitar requerimientos). El antiguo
  `PUT /expedientes/:id/transicionar` se eliminó.
- Historial: colección `expedienteEstados` ({expedienteId, mandanteId, estadoAnterior,
  estadoNuevo, origen, motivo, detalle, actorUid, actorNombre, createdAt}), escrita en la misma
  transacción que cada cambio de estado (también los automáticos); además cada cambio va a
  Bitácora. Lectura por mandanteId; nadie escribe desde el cliente.
- Vencidos: `resumen.vencidos` (instancias activas "cumple" con fechaVencimiento anterior a hoy en
  America/Santiago) y `resumen.fechaVencimientoMasProxima` se recalculan en la transacción de cada
  evaluación, tras cada sincronización y en el recálculo completo. Como un requisito vence con el
  paso del tiempo, la función programada diaria `actualizarVencimientosExpedientes` (00:30
  Santiago) recalcula los Expedientes cuya fecha más próxima ya pasó.
- Expediente cerrado: rechaza con 409 evaluar, subir o enlazar evidencia, agregar o quitar
  requerimientos y asignar personas o maquinarias.
