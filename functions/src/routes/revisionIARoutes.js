const express = require("express");
const router = express.Router();
const controller = require("../controllers/revisionIAController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

router.use(authMiddleware);

// Operan (estiman, crean sesiones, envían archivos, consolidan, resuelven):
// superadmin y evaluador. Leen: además mandante_admin y mandante_lector,
// solo de su Mandante (lo acota el service).
const ROLES_OPERAN = ["superadmin", "evaluador"];
const ROLES_LEEN = [...ROLES_OPERAN, "mandante_admin", "mandante_lector"];
const operan = requireRole(ROLES_OPERAN);
const leen = requireRole(ROLES_LEEN);

router.get("/estado", leen, controller.estadoIA);
router.post("/estimar", operan, controller.estimar);
// Análisis de estructura (sin persistir): también mandante_admin, para
// "Probar con una carpeta" en Configuración IA.
router.post("/estructura/analizar",
    requireRole([...ROLES_OPERAN, "mandante_admin"]),
    controller.analizarEstructura);
router.get("/sesiones", leen, controller.listar);
router.post("/sesiones", operan, controller.crearSesion);
router.get("/sesiones/:id", leen, controller.detalle);
router.post("/sesiones/:id/archivos", operan, controller.procesarArchivo);
router.post("/sesiones/:id/carpetas/consolidar", operan,
    controller.consolidar);
router.post("/sesiones/:id/finalizar", operan, controller.finalizar);
router.post("/sesiones/:id/cancelar", operan, controller.cancelar);
router.post("/resultados/:id/resolver", operan, controller.resolver);
router.get("/tipos-documentales", leen, controller.listarTipos);
// Consumo (límite y últimas sesiones): solo superadmin. El gasto de IA es
// información interna de SmartApplication.
router.get("/consumo", requireRole(["superadmin"]), controller.consumo);

module.exports = router;
