const express = require("express");
const router = express.Router();
const controller = require("../controllers/ubicacionExpedienteController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Ubicación documental en el expediente. Leen superadmin, evaluador y los
// roles del Mandante; confirmar y sugerir alias, superadmin y evaluador;
// aprobar alias, solo superadmin (lo valida el service).
router.use(authMiddleware, requireRole(["superadmin", "evaluador",
  "mandante_admin", "mandante_lector"]));

router.get("/alias-sugeridos", controller.listarAliasSugeridos);
router.post("/alias-sugeridos", controller.sugerirAlias);
router.patch("/alias-sugeridos/:id", controller.resolverAliasSugerido);
router.get("/:expedienteId", controller.config);
router.post("/:expedienteId/overrides", controller.confirmarOverride);
router.patch("/:expedienteId/overrides/:id/desactivar",
    controller.desactivarOverride);

module.exports = router;
