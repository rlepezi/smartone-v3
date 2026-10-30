const express = require("express");
const controller =
    require("../controllers/revisionRequerimientoIAController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

const router = express.Router();

// "Revisar con IA" por requerimiento: superadmin y evaluador (el servicio
// también lo verifica y acota el expediente al alcance del usuario).
router.use(authMiddleware, requireRole(["superadmin", "evaluador"]));

router.get("/expedientes/:id/estado", controller.estado);
router.get("/expedientes/:id", controller.listar);
router.post("/expedientes/:id/revisar", controller.revisar);
router.post("/:revisionId/descartar", controller.descartar);

module.exports = router;
