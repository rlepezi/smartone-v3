const express = require("express");
const router = express.Router();
const controller = require("../controllers/fuenteDocumentalController");
const sharePoint = require("../controllers/sharePointController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Fuentes documentales (una sola activa por Mandante):
//  - SharePoint: superadmin (cualquier Mandante) y mandante_admin (solo el
//    suyo; lo valida el service).
//  - Carpeta local: solo superadmin.
//  - Fuente activa (para vincular Carpetas de empresa y leer la carpeta del
//    expediente): también evaluador y mandante_lector (acotado en el
//    service).
const ADMINISTRAN = requireRole(["superadmin", "mandante_admin"]);

router.use(authMiddleware);

// Conector SharePoint (Microsoft Graph, solo lectura). Probar la conexión:
// quienes administran la fuente. Navegar y leer archivos: quienes consultan
// la fuente activa (el service acota el Mandante y valida el rol).
const NAVEGAN = requireRole(["superadmin", "evaluador", "mandante_admin",
  "mandante_lector"]);
router.post("/sharepoint/probar-conexion", ADMINISTRAN,
    sharePoint.probarConexion);
router.get("/sharepoint/hijos", NAVEGAN, sharePoint.listarHijos);
router.get("/sharepoint/items/:itemId", NAVEGAN, sharePoint.obtenerItem);
router.get("/sharepoint/items/:itemId/contenido", NAVEGAN,
    sharePoint.contenido);

router.get("/activa", requireRole(["superadmin", "evaluador",
  "mandante_admin", "mandante_lector"]), controller.activa);
router.put("/local/:mandanteId", requireRole(["superadmin"]),
    controller.guardarLocal);
router.get("/", ADMINISTRAN, controller.listar);
router.post("/", ADMINISTRAN, controller.crear);
router.get("/:id", ADMINISTRAN, controller.obtener);
router.put("/:id", ADMINISTRAN, controller.actualizar);
router.post("/:id/desactivar", ADMINISTRAN, controller.desactivar);
router.post("/:id/reactivar", ADMINISTRAN, controller.reactivar);

module.exports = router;
