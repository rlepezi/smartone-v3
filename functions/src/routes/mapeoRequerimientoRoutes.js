const express = require("express");
const router = express.Router();
const controller = require("../controllers/mapeoRequerimientoController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Mapeo documental (nodo de la plantilla ↔ requerimiento). Leen superadmin,
// evaluador y los roles del Mandante (el suyo); vincular y desvincular,
// solo superadmin (lo valida el service, junto con el mandanteId).
router.use(authMiddleware, requireRole(["superadmin", "evaluador",
  "mandante_admin", "mandante_lector"]));

router.get("/", controller.listar);
router.get("/requerimientos/:requerimientoId", controller.porRequerimiento);
router.post("/vincular", controller.vincular);
router.post("/desvincular", controller.desvincular);

module.exports = router;
