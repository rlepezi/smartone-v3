const express = require("express");
const router = express.Router();
const personaController = require("../controllers/personaController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Lectura: catálogo global, visible para todos los roles del sistema.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];
// Escritura: solo superadmin y cualquier mandante_admin (no hay "dueño").
const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

router.get("/", requireRole(ROLES_LECTURA), personaController.list);
router.get(
    "/:id/eventos-recientes",
    requireRole(ROLES_LECTURA),
    personaController.eventosRecientes,
);
router.get("/:id", requireRole(ROLES_LECTURA), personaController.getById);
router.get(
    "/:id/resumen", requireRole(ROLES_LECTURA), personaController.resumen,
);
router.post("/", requireRole(ROLES_ESCRITURA), personaController.create);
// Derecho de cancelación (Ley 21.719): acción excepcional, solo superadmin.
router.get(
    "/:id/impacto-anonimizacion",
    requireRole(["superadmin"]),
    personaController.impactoAnonimizacion,
);
router.get(
    "/:id/documentos-purga",
    requireRole(["superadmin"]),
    personaController.documentosPurga,
);
router.post(
    "/:id/anonimizar",
    requireRole(["superadmin"]),
    personaController.anonimizar,
);
router.get(
    "/:id/relaciones", requireRole(ROLES_LECTURA),
    personaController.listarRelaciones,
);
router.post(
    "/:id/cambiar-empresa", requireRole(ROLES_ESCRITURA),
    personaController.cambiarEmpresa,
);
router.post(
    "/:id/terminar-relacion", requireRole(ROLES_ESCRITURA),
    personaController.terminarRelacion,
);
router.put("/:id", requireRole(ROLES_ESCRITURA), personaController.update);
router.delete(
    "/:id",
    requireRole(ROLES_ESCRITURA),
    personaController.deactivate,
);

module.exports = router;
