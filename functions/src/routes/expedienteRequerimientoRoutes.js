const express = require("express");
const router = express.Router();
const expedienteRequerimientoController =
    require("../controllers/expedienteRequerimientoController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

router.use(authMiddleware);

// Solo lectura: las instancias las escriben la generación, la
// sincronización y las evaluaciones (backend). Alcance por Mandante en el
// servicio.
router.get(
    "/",
    requireRole([
      "superadmin", "mandante_admin", "mandante_lector", "evaluador",
    ]),
    expedienteRequerimientoController.list,
);

module.exports = router;
