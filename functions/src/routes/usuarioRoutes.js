const express = require("express");
const router = express.Router();
const usuarioController = require("../controllers/usuarioController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// superadmin, mandante_admin y admin_comercial pueden administrar este
// módulo (cada uno con su propio alcance, aplicado en el Service):
// evaluador y mandante_lector no tienen acceso alguno a Usuarios.
const PUEDE_ADMINISTRAR_USUARIOS = [
  "superadmin", "mandante_admin", "admin_comercial",
];
// Ver métricas/actividad/sesiones: más restrictivo que el CRUD básico —
// admin_comercial queda afuera (Fase D). El Service vuelve a validar esto
// (_exigirPuedeVerActividad) como defensa en profundidad.
const PUEDE_VER_ACTIVIDAD = ["superadmin", "mandante_admin"];

router.get(
    "/", requireRole(PUEDE_ADMINISTRAR_USUARIOS), usuarioController.list,
);
// "/actividad-hoy" va ANTES de "/:id" — si no, Express lo capturaría como
// un id (mismo patrón ya usado en proyectoRoutes.js/recursoRoutes.js).
router.get(
    "/actividad-hoy",
    requireRole(PUEDE_ADMINISTRAR_USUARIOS),
    usuarioController.actividadHoy,
);
router.get(
    "/:id",
    requireRole(PUEDE_ADMINISTRAR_USUARIOS),
    usuarioController.getById,
);
router.get(
    "/:id/metricas",
    requireRole(PUEDE_VER_ACTIVIDAD),
    usuarioController.metricas,
);
router.get(
    "/:id/actividad",
    requireRole(PUEDE_VER_ACTIVIDAD),
    usuarioController.actividad,
);
router.get(
    "/:id/sesiones",
    requireRole(PUEDE_VER_ACTIVIDAD),
    usuarioController.sesiones,
);
router.post(
    "/", requireRole(PUEDE_ADMINISTRAR_USUARIOS), usuarioController.create,
);
router.put(
    "/:id",
    requireRole(PUEDE_ADMINISTRAR_USUARIOS),
    usuarioController.update,
);
// PATCH: mismo handler que PUT (el prompt de Fase D pide PATCH
// puntualmente; se mantiene PUT también para no romper al frontend
// existente, que ya lo usa).
router.patch(
    "/:id",
    requireRole(PUEDE_ADMINISTRAR_USUARIOS),
    usuarioController.update,
);
router.delete(
    "/:id",
    requireRole(PUEDE_ADMINISTRAR_USUARIOS),
    usuarioController.deactivate,
);
router.post(
    "/:id/desactivar",
    requireRole(PUEDE_ADMINISTRAR_USUARIOS),
    usuarioController.deactivate,
);
router.post(
    "/:id/reactivar",
    requireRole(PUEDE_ADMINISTRAR_USUARIOS),
    usuarioController.reactivate,
);
router.post(
    "/:id/reset-password",
    requireRole(PUEDE_ADMINISTRAR_USUARIOS),
    usuarioController.resetPassword,
);
router.post(
    "/:id/revocar-sesiones",
    requireRole(PUEDE_ADMINISTRAR_USUARIOS),
    usuarioController.revocarSesiones,
);

module.exports = router;
