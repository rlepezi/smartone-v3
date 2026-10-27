const express = require("express");
const router = express.Router();
const controller = require("../controllers/plantillaEstructuraController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

router.use(authMiddleware);

// Leer la activa: quienes usan Revisiones IA. Administrar: superadmin y
// mandante_admin (solo su Mandante; lo valida el service).
const ROLES_LEEN = [
  "superadmin", "evaluador", "mandante_admin", "mandante_lector",
];
const ROLES_ADMINISTRAN = ["superadmin", "mandante_admin"];

router.get("/", requireRole(ROLES_LEEN), controller.obtenerActiva);
router.post("/importar", requireRole(ROLES_ADMINISTRAN), controller.importar);
router.put("/:id", requireRole(ROLES_ADMINISTRAN), controller.actualizar);
router.post("/:id/desactivar", requireRole(ROLES_ADMINISTRAN),
    controller.desactivar);
router.patch("/:id/habilitacion", requireRole(ROLES_ADMINISTRAN),
    controller.habilitacion);
router.post("/:id/habilitacion/masiva", requireRole(ROLES_ADMINISTRAN),
    controller.habilitacionMasiva);
router.get("/:id/alcance", requireRole(ROLES_LEEN), controller.alcance);

module.exports = router;
