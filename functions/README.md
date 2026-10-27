# SmartOne v3 — Cloud Functions

## Revisiones IA: secretos

La API key de Anthropic se ingresa desde **Configuración → Inteligencia
Artificial** (solo superadmin) y se guarda cifrada con AES-256-GCM en
`configuracionIA/global`. La clave maestra de ese cifrado es el secreto
`AI_CONFIG_ENCRYPTION_KEY`: 32 bytes aleatorios en base64.

La función `api` declara el secreto, así que **debe existir antes de
desplegar**; si falta, el deploy falla.

### Generar la clave maestra

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Guárdala en un lugar seguro: si se pierde o se cambia, la API key guardada
deja de poder descifrarse y hay que volver a ingresarla en la pantalla.

### Local (emulador)

Crea `functions/.secret.local` (ya está ignorado por git mediante
`functions/.gitignore`, regla `*.local`):

```
AI_CONFIG_ENCRYPTION_KEY=<la clave en base64>
```

### Proyectos de Firebase (DEV, QA, producción)

```bash
firebase functions:secrets:set AI_CONFIG_ENCRYPTION_KEY --project <proyecto>
```

Pega la clave cuando la pida. Cada proyecto puede tener su propia clave.

### Respaldo opcional: ANTHROPIC_API_KEY

Si no hay una API key activa en la configuración, el backend usa
`process.env.ANTHROPIC_API_KEY` si existe (por ejemplo, en `functions/.env`).
No está declarada como secreto de la función para que su ausencia no impida
el deploy.

## Revisiones IA: puesta en marcha

1. Crear el secreto `AI_CONFIG_ENCRYPTION_KEY` (ver arriba).
2. Desplegar functions, reglas e índices:
   `firebase deploy --only functions,firestore:rules,firestore:indexes --project <proyecto>`.
3. Cargar los tipos documentales del piloto (idempotente):
   `node src/scripts/seedTiposDocumentales.js` (con `functions/serviceAccountKey.json`).
4. Como superadmin, en **Configuración → Inteligencia Artificial**: ingresar la
   API key de Anthropic, **Probar conexión**, y revisar modelo por defecto,
   precios y límite de gasto mensual. Los identificadores y precios de los
   modelos se verifican en https://platform.claude.com/docs.
5. En el catálogo de Requerimientos (nivel Persona), sección **Validación con
   IA**: asociar el tipo documental (cédula o licencia) y, para la licencia,
   las clases aceptadas. Sin esto, la revisión extrae los datos pero no
   encuentra qué requerimiento evaluar.

### Cómo probar con una carpeta de ejemplo

```
Prueba/
├── 12345678-5 Juan Pérez/      ← RUT de una persona que participa en el Mandante
│   ├── cedula_frente.jpg
│   ├── cedula_reverso.jpg      ← con la MRZ (3 líneas) visible
│   └── licencia.pdf
├── 11111111-1/                 ← RUT válido no registrado → "Crear persona"
│   └── cedula.jpg
├── 12345678-4/                 ← DV inválido: se marca en la vista previa
│   └── foto.heic               ← formato no soportado: omitido
└── suelto.jpg                  ← en la raíz: "sin carpeta de persona"
```

En **Revisiones IA → Nueva revisión** elegir la carpeta, revisar la vista
previa (RUT, persona, válidos, omitidos y costo estimado) e iniciar. El
detalle muestra el progreso en vivo; al terminar cada carpeta se ven las
reglas, los datos extraídos y la propuesta, con **Aceptar**, **Corregir** o
**Descartar**. Aceptar o corregir crea la Evaluación (modalidad
`ia_asistida`) en cada expediente que pide ese documento, con una Evidencia
sin archivo (`origen: carpeta_local`). Volver a revisar los mismos archivos
reutiliza la extracción (costo 0). El panel **Tipos documentales** muestra la
concordancia y los documentos que la IA clasificó como OTRO.

Los archivos nunca se almacenan: solo se guardan sus datos extraídos, su
ruta relativa y su hash SHA-256.

## Tests

```bash
npm test
```

Jest, solo para las reglas puras de Revisiones IA (`test/*.spec.js`).
