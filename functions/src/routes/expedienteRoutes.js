const express = require("express");
const router = express.Router();
const expedienteController = require("../controllers/expedienteController");
const vencimientoController = require("../controllers/vencimientoController");
const revisionExpedienteController =
    require("../controllers/revisionExpedienteController");
const revisionRequerimientoIAController =
    require("../controllers/revisionRequerimientoIAController");
const repositorioDocumentalController =
    require("../controllers/repositorioDocumentalController");
const carpetaEmpresaController =
    require("../controllers/carpetaEmpresaController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Lectura: todos los roles del catálogo tienen al menos acceso de lectura.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];
// Crear: solo superadmin y mandante_admin — evaluador NO puede crear
// expedientes, solo evaluarlos.
const ROLES_CREAR = ["superadmin", "mandante_admin"];
// Agregar/quitar Requerimientos del Expediente: superadmin, mandante_admin
// y evaluador — mandante_lector queda excluido (es de solo lectura).
const ROLES_TRANSICIONAR = ["superadmin", "mandante_admin", "evaluador"];
// Iniciar ejecución y cerrar: superadmin y mandante_admin (este último
// acotado a su Mandante en el servicio). Correcciones: solo superadmin.
const ROLES_ESTADO = ["superadmin", "mandante_admin"];
const ROLES_CORRECCION = ["superadmin"];

router.get("/", requireRole(ROLES_LECTURA), expedienteController.list);
router.get("/:id", requireRole(ROLES_LECTURA), expedienteController.getById);
router.get(
    "/:id/eventos-recientes",
    requireRole(ROLES_LECTURA),
    expedienteController.eventosRecientes,
);
router.get(
    "/:id/requerimientos",
    requireRole(ROLES_LECTURA),
    expedienteController.listarRequerimientos,
);
router.get(
    "/:id/vencimientos",
    requireRole(ROLES_LECTURA),
    vencimientoController.delExpediente,
);
// Repositorio documental (carpeta local o SharePoint): todos leen;
// configuran superadmin, evaluador y mandante_admin.
router.get(
    "/:id/repositorio-documental",
    requireRole(ROLES_LECTURA),
    repositorioDocumentalController.obtener,
);
router.patch(
    "/:id/repositorio-documental",
    requireRole(ROLES_TRANSICIONAR),
    repositorioDocumentalController.actualizar,
);
router.patch(
    "/:id/carpeta-sujeto",
    requireRole(ROLES_TRANSICIONAR),
    repositorioDocumentalController.asignarCarpetaSujeto,
);
// Carpeta de empresa del expediente: la desvincula (la carpeta conserva su
// mapeo para reutilizarla).
router.post(
    "/:id/desvincular-carpeta",
    requireRole(ROLES_TRANSICIONAR),
    carpetaEmpresaController.desvincular,
);
// Revisiones IA del Expediente: todos leen (mandante_lector en solo
// lectura); configuran superadmin, evaluador y mandante_admin.
router.get(
    "/:id/revisiones-ia/config",
    requireRole(ROLES_LECTURA),
    revisionExpedienteController.obtenerConfig,
);
router.put(
    "/:id/revisiones-ia/config",
    requireRole(ROLES_TRANSICIONAR),
    revisionExpedienteController.guardarConfig,
);
router.post(
    "/:id/revisiones-ia/aceptar-lote",
    requireRole(["superadmin", "evaluador"]),
    revisionExpedienteController.aceptarLote,
);
router.get(
    "/:id/revisiones-ia/propuestas",
    requireRole(ROLES_LECTURA),
    revisionExpedienteController.propuestas,
);
// Pauta de validación (reglas activas y estado IA) de cada requerimiento:
// la ven todos los que leen el expediente; guía también la revisión manual.
router.get(
    "/:id/revisiones-ia/pautas",
    requireRole(ROLES_LECTURA),
    revisionRequerimientoIAController.pautas,
);
router.get(
    "/:id/revisiones-ia/matriz",
    requireRole(ROLES_LECTURA),
    revisionExpedienteController.matriz,
);
router.post("/", requireRole(ROLES_CREAR), expedienteController.create);
// Reintentar la generación de instancias (Expediente "en_proceso").
router.post(
    "/:id/generar",
    requireRole(ROLES_CREAR),
    expedienteController.reintentarGeneracion,
);
// Reparación de contadores (resumen / resumenSujetos): solo superadmin.
router.post(
    "/:id/recalcular-resumen",
    requireRole(["superadmin"]),
    expedienteController.repararResumen,
);
router.get(
    "/:id/historial-estados",
    requireRole(ROLES_LECTURA),
    expedienteController.historialEstados,
);
router.post(
    "/:id/iniciar-ejecucion",
    requireRole(ROLES_ESTADO),
    expedienteController.iniciarEjecucion,
);
router.post(
    "/:id/cerrar",
    requireRole(ROLES_ESTADO),
    expedienteController.cerrar,
);
router.post(
    "/:id/volver-a-aprobado",
    requireRole(ROLES_CORRECCION),
    expedienteController.volverAAprobado,
);
router.post(
    "/:id/reabrir",
    requireRole(ROLES_CORRECCION),
    expedienteController.reabrir,
);
router.post(
    "/:id/requerimientos",
    requireRole(ROLES_TRANSICIONAR),
    expedienteController.agregarRequerimiento,
);
router.delete(
    "/:id/requerimientos/:requerimientoId",
    requireRole(ROLES_TRANSICIONAR),
    expedienteController.quitarRequerimiento,
);

module.exports = router;
