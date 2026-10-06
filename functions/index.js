const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {RESEND_API_KEY} = require("./src/services/emailService");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
require("dotenv").config();

// Inicialización de Firebase Admin SDK (Singleton)
if (!admin.apps.length) {
  admin.initializeApp();
}

const app = express();

// ==========================================
// MIDDLEWARES GLOBALES
// ==========================================

// Configuración de CORS permitiendo orígenes cruzados
app.use(cors({origin: true}));

// Parser selectivo de JSON (omite multipart/form-data para subida de archivos)
app.use((req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    return next();
  }
  express.json({limit: "25mb"})(req, res, next);
});

// Middleware de saneamiento básico de query params y strings
app.use(express.urlencoded({extended: true, limit: "25mb"}));

// Las rutas de este Express app NO llevan prefijo /api (ver app.use más
// abajo: "/mandantes", "/personas", etc.). Eso funciona al llamar
// directo a la URL de Cloud Functions porque el segmento "api" ahí es el
// NOMBRE de la función — Cloud Functions lo recorta antes de invocar el
// handler. Pero el rewrite de Hosting (firebase.json, "/api/**" → esta
// función) reenvía la ruta completa SIN recortarla, así que en
// producción Express vería "/api/mandantes" en vez de "/mandantes". Este
// middleware recorta ese prefijo cuando está presente, para que ambas
// formas de invocar la función (emulador directo, y vía rewrite de
// Hosting en producción) terminen resolviendo la misma ruta interna.
app.use((req, res, next) => {
  if (req.url === "/api" || req.url.startsWith("/api/")) {
    req.url = req.url.slice(4) || "/";
  }
  next();
});

// ==========================================
// IMPORTACIÓN DE RUTAS
// ==========================================

const respaldoRoutes = require("./src/routes/respaldoRoutes");
const privacidadRoutes = require("./src/routes/privacidadRoutes");
const derechosArcoService = require("./src/services/derechosArcoService");
const respaldoService = require("./src/services/respaldoService");
const mandanteRoutes = require("./src/routes/mandanteRoutes");
const usuarioRoutes = require("./src/routes/usuarioRoutes");
const proyectoRoutes = require("./src/routes/proyectoRoutes");
const empresaRoutes = require("./src/routes/empresaRoutes");
const personaRoutes = require("./src/routes/personaRoutes");
const relacionLaboralRoutes =
    require("./src/routes/relacionLaboralRoutes");
const recursoRoutes = require("./src/routes/recursoRoutes");
const perfilParticipacionRoutes =
    require("./src/routes/perfilParticipacionRoutes");
const perfilRecursoRoutes = require("./src/routes/perfilRecursoRoutes");
const participacionRoutes = require("./src/routes/participacionRoutes");
const expedienteRoutes = require("./src/routes/expedienteRoutes");
const requerimientoRoutes = require("./src/routes/requerimientoRoutes");
const perfilRequerimientoRoutes =
    require("./src/routes/perfilRequerimientoRoutes");
const evidenciaRoutes = require("./src/routes/evidenciaRoutes");
const evidenciaRequerimientoRoutes =
    require("./src/routes/evidenciaRequerimientoRoutes");
const evaluacionRoutes = require("./src/routes/evaluacionRoutes");
const asignacionRoutes = require("./src/routes/asignacionRoutes");
const bitacoraRoutes = require("./src/routes/bitacoraRoutes");
const reporteRoutes = require("./src/routes/reporteRoutes");
const acreditacionRoutes = require("./src/routes/acreditacionRoutes");
const sesionRoutes = require("./src/routes/sesionRoutes");
const sesionMantenimientoService =
    require("./src/services/sesionMantenimientoService");
const sesionRetencionService = require("./src/services/sesionRetencionService");
const metricaUsuarioService = require("./src/services/metricaUsuarioService");

// ==========================================
// DEFINICIÓN DE ENDPOINTS
// ==========================================

// Health Check / Ping
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    app: "SmartOne v3.0 API",
    timestamp: new Date().toISOString(),
  });
});

// Rutas de Negocio
app.use("/mandantes", mandanteRoutes);
app.use("/usuarios", usuarioRoutes);
app.use("/proyectos", proyectoRoutes);
app.use("/empresas", empresaRoutes);
app.use("/personas", personaRoutes);
app.use("/relaciones-laborales", relacionLaboralRoutes);
app.use("/recursos", recursoRoutes);
app.use("/perfiles-participacion", perfilParticipacionRoutes);
app.use("/perfiles-recurso", perfilRecursoRoutes);
app.use("/participaciones", participacionRoutes);
app.use("/expedientes", expedienteRoutes);
app.use("/requerimientos", requerimientoRoutes);
app.use("/perfil-requerimientos", perfilRequerimientoRoutes);
app.use("/evidencias", evidenciaRoutes);
app.use("/evidencia-requerimientos", evidenciaRequerimientoRoutes);
app.use("/evaluaciones", evaluacionRoutes);
app.use("/asignaciones", asignacionRoutes);
app.use("/bitacora", bitacoraRoutes);
app.use("/reportes", reporteRoutes);
app.use("/acreditaciones", acreditacionRoutes);
app.use("/sesiones", sesionRoutes);
app.use("/admin/respaldos", respaldoRoutes);
app.use("/admin/privacidad", privacidadRoutes);

// Manejador de rutas no encontradas (404)
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message:
      `La ruta [${req.method}] ${req.originalUrl} ` +
      "no existe en SmartOne API v3.",
  });
});

// Middleware centralizado de errores (500)
app.use((err, req, res, next) => {
  console.error("❌ Error no controlado:", err);
  res.status(err.status || 500).json({
    error: err.name || "InternalServerError",
    message: err.message || "Error interno en el servidor de SmartOne.",
  });
});

// ==========================================
// EXPORTACIÓN CLOUD FUNCTION v2
// ==========================================

exports.api = onRequest(
    {
      region: "us-central1",
      cors: true,
      maxInstances: 10,
      memory: "512MiB",
      timeoutSeconds: 120,
      invoker: "public",
      // "Ejecutar respaldo ahora" vive dentro de esta misma función HTTP
      // y puede terminar disparando un correo (respaldoNotificacionService).
      secrets: [RESEND_API_KEY],
    },
    app,
);

// Respaldo automático de Firestore. Firebase crea y gestiona el Cloud
// Scheduler de esta función (no hay que configurar ninguno a mano). Corre
// cada hora y solo actúa si la configuración lo habilita y ya toca según
// el intervalo y la hora configurados.
exports.respaldoProgramado = onSchedule(
    {
      schedule: "every 60 minutes",
      timeZone: "America/Santiago",
      region: "us-central1",
      memory: "256MiB",
      timeoutSeconds: 120,
      secrets: [RESEND_API_KEY],
    },
    async () => {
      await respaldoService.ejecutarProgramado();
    },
);

// Purga diaria de documentos de identidad de Personas anonimizadas: elimina
// el archivo físico de las Evidencias cuyo periodo de gracia ya venció (el
// registro en Firestore se conserva, sin acceso al archivo).
exports.purgaDocumentosIdentidad = onSchedule(
    {
      schedule: "every 24 hours",
      timeZone: "America/Santiago",
      region: "us-central1",
      memory: "256MiB",
      timeoutSeconds: 300,
    },
    async () => {
      const r = await derechosArcoService.purgarVencidas();
      console.log("Purga de documentos de identidad:", JSON.stringify(r));
    },
);

// Cierra por timeout las Sesiones (telemetría de accesos) sin latido en
// los últimos 15 minutos.
exports.cerrarSesionesInactivas = onSchedule(
    {
      schedule: "every 15 minutes",
      timeZone: "America/Santiago",
      region: "us-central1",
      memory: "256MiB",
      timeoutSeconds: 120,
    },
    async () => {
      const n = await sesionMantenimientoService.cerrarAbandonadas();
      console.log(`Sesiones cerradas por timeout: ${n}`);
    },
);

// Retención de Sesiones: purga mensual de telemetría con más de 12 meses
// de antigüedad (excepción documentada a la regla de no-eliminación
// física — ver sesionRetencionService.js).
exports.purgaSesionesAntiguas = onSchedule(
    {
      schedule: "0 4 1 * *",
      timeZone: "America/Santiago",
      region: "us-central1",
      memory: "256MiB",
      timeoutSeconds: 300,
    },
    async () => {
      const n = await sesionRetencionService.purgarVencidas();
      console.log(`Sesiones purgadas por retención (12 meses): ${n}`);
    },
);

// Alimenta metricasUsuarioDiarias/{usuarioId}_{fecha} desde cada evento
// nuevo de Bitácora (Fase C) — único punto de entrada para
// expedientesCreados/evaluacionesRealizadas, nunca contadores sueltos en
// cada service de negocio.
exports.onBitacoraCreada = onDocumentCreated(
    {document: "bitacora/{bitacoraId}", region: "us-central1"},
    async (event) => {
      const registro = event.data?.data();
      if (!registro) return;
      try {
        await metricaUsuarioService.procesarEventoBitacora(registro);
      } catch (error) {
        // Igual que bitacoraLogger: la trazabilidad/métricas nunca deben
        // hacer fallar la operación de negocio que las originó — acá ya
        // corren completamente desacopladas (es un trigger aparte), pero
        // se mantiene el mismo criterio de "solo loguear, nunca relanzar".
        console.error(
            "⚠️ Error al procesar evento de bitácora para métricas:", error,
        );
      }
    },
);
