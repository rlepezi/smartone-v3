const express = require("express");
const router = express.Router();
const controller = require("../controllers/plantillaEstructuraController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

router.use(authMiddleware);

// Leer la activa: quienes usan Revisiones IA y el Mapeo documental.
// Administrar: solo superadmin (los demás, solo lectura).
const ROLES_LEEN = [
  "superadmin", "evaluador", "mandante_admin", "mandante_lector",
];
const ROLES_ADMINISTRAN = ["superadmin"];

router.get("/", requireRole(ROLES_LEEN), controller.obtenerActiva);
router.get("/nodos", requireRole(ROLES_LEEN), controller.nodos);
router.post("/importar", requireRole(ROLES_ADMINISTRAN), controller.importar);
router.put("/:id", requireRole(ROLES_ADMINISTRAN), controller.actualizar);
router.post("/:id/desactivar", requireRole(ROLES_ADMINISTRAN),
    controller.desactivar);
router.patch("/:id/habilitacion", requireRole(ROLES_ADMINISTRAN),
    controller.habilitacion);
router.post("/:id/habilitacion/masiva", requireRole(ROLES_ADMINISTRAN),
    controller.habilitacionMasiva);
router.get("/:id/alcance", requireRole(ROLES_LEEN), controller.alcance);
router.post("/:id/duplicar", requireRole(ROLES_ADMINISTRAN),
    controller.duplicar);

module.exports = router;
