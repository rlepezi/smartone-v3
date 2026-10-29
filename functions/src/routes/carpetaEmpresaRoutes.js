const express = require("express");
const router = express.Router();
const controller = require("../controllers/carpetaEmpresaController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Carpetas de empresa (subcarpetas de la fuente documental del Mandante):
//  - listado: superadmin, mandante_admin (acotado a su Mandante) y
//    evaluador (Mapeo documental);
//  - Mapeo documental (registrar, requerimientos asignables): superadmin y
//    evaluador;
//  - crear/vincular y editar su mapeo: superadmin, evaluador y
//    mandante_admin (el rol que crea acreditaciones). El acceso al
//    expediente y al Mandante lo valida el service.
const EDITAN = requireRole(["superadmin", "evaluador", "mandante_admin"]);

router.use(authMiddleware);

const MAPEO = requireRole(["superadmin", "evaluador"]);

router.get("/", requireRole(["superadmin", "mandante_admin", "evaluador"]),
    controller.listar);
router.post("/registrar", MAPEO, controller.registrar);
router.get("/:id/requerimientos", MAPEO, controller.requerimientos);
router.post("/verificar", EDITAN, controller.verificar);
router.post("/vincular", EDITAN, controller.vincular);
router.patch("/:id", EDITAN, controller.actualizar);

module.exports = router;
