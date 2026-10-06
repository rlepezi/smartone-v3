const express = require("express");
const router = express.Router();
const evidenciaController = require("../controllers/evidenciaController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Lectura: todos los roles del catálogo tienen al menos acceso de lectura.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];
// Escritura: solo superadmin y mandante_admin — "evaluador" puede leer y
// vincular Evidencias existentes a Requerimientos, pero NO puede subir
// Evidencias nuevas.
const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

router.get("/", requireRole(ROLES_LECTURA), evidenciaController.list);
router.get("/:id", requireRole(ROLES_LECTURA), evidenciaController.getById);
router.post("/", requireRole(ROLES_ESCRITURA), evidenciaController.create);
router.put("/:id", requireRole(ROLES_ESCRITURA), evidenciaController.update);
// Excepción manual a la purga por anonimización: solo superadmin, con motivo.
router.post(
    "/:id/cancelar-purga",
    requireRole(["superadmin"]),
    evidenciaController.cancelarPurga,
);

module.exports = router;
