const express = require("express");
const router = express.Router();
const requerimientoController =
    require("../controllers/requerimientoController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Lectura: los requerimientos de un Mandante. Los roles de Mandante quedan
// fijos en el suyo; superadmin y evaluador deben indicar `mandanteId`.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];
// Escritura: superadmin y mandante_admin (este, solo en su Mandante).
const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

router.get("/", requireRole(ROLES_LECTURA), requerimientoController.list);
router.get(
    "/:id", requireRole(ROLES_LECTURA), requerimientoController.getById,
);
// Crear y editar guardan el Requerimiento con su aplicabilidad (vínculos)
// en una sola transacción. No hay DELETE: el estado se cambia editando.
router.post(
    "/", requireRole(ROLES_ESCRITURA), requerimientoController.create,
);
router.put(
    "/:id", requireRole(ROLES_ESCRITURA), requerimientoController.update,
);

module.exports = router;
