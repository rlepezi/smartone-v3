const express = require("express");
const router = express.Router();
const empresaController = require("../controllers/empresaController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Lectura: catálogo global, visible para todos los roles del sistema.
// admin_comercial lee, crea y edita Empresas y gestiona su asociación con
// Mandantes (no tiene acceso a Personas ni Recursos). La visibilidad por
// Mandante se decide en el servicio (utils/alcanceMandante.js).
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
  "admin_comercial",
];
// Escritura: solo superadmin y CUALQUIER mandante_admin (no hay "dueño").
const ROLES_ESCRITURA = ["superadmin", "mandante_admin", "admin_comercial"];
const ROLES_GESTION_MANDANTES = ["superadmin", "admin_comercial"];
// Personas y Maquinarias de la Empresa: sin admin_comercial (no tiene
// acceso a Personas ni Recursos; responde 403).
const ROLES_SUJETOS = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];

router.get("/", requireRole(ROLES_LECTURA), empresaController.list);
router.get("/:id", requireRole(ROLES_LECTURA), empresaController.getById);
router.get(
    "/:id/resumen", requireRole(ROLES_LECTURA), empresaController.resumen,
);
router.get(
    "/:id/recursos", requireRole(ROLES_SUJETOS), empresaController.recursos,
);
router.get(
    "/:id/eventos-recientes",
    requireRole(ROLES_LECTURA),
    empresaController.eventosRecientes,
);
router.get(
    "/:id/mandantes", requireRole(ROLES_LECTURA),
    empresaController.listarMandantes,
);
// mandante_admin solo asocia a su propio Mandante (lo valida el servicio).
router.post(
    "/:id/mandantes", requireRole(ROLES_ESCRITURA),
    empresaController.asociarMandante,
);
router.delete(
    "/:id/mandantes/:mandanteId", requireRole(ROLES_GESTION_MANDANTES),
    empresaController.desasociarMandante,
);
router.post("/", requireRole(ROLES_ESCRITURA), empresaController.create);
router.put("/:id", requireRole(ROLES_ESCRITURA), empresaController.update);
router.delete(
    "/:id",
    requireRole(ROLES_ESCRITURA),
    empresaController.deactivate,
);

module.exports = router;
