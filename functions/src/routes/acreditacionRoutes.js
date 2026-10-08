const express = require("express");
const router = express.Router();
const acreditacionController = require("../controllers/acreditacionController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones.
router.use(authMiddleware);

// Mismos roles de escritura que Participación/Expediente y personas/maquinarias
// asignadas: el
// reemplazo toca las tres entidades a la vez.
const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];
// Lectura: mismos roles que ya pueden leer Participación y personas/maquinarias
// asignadas, para
// alimentar el wizard.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];

router.get(
    "/entidades",
    requireRole(ROLES_LECTURA),
    acreditacionController.listarEntidades,
);
router.get(
    "/preview-requerimientos",
    requireRole(ROLES_LECTURA),
    acreditacionController.previewRequerimientos,
);
router.post(
    "/reemplazar",
    requireRole(ROLES_ESCRITURA),
    acreditacionController.reemplazar,
);
// POST (no GET) porque `seleccion` es un arreglo — de solo lectura, no
// escribe nada, por eso queda con los roles de lectura igual que los
// otros preview.
router.post(
    "/preview-nueva",
    requireRole(ROLES_LECTURA),
    acreditacionController.previewNueva,
);
router.get(
    "/entidades-empresa",
    requireRole(ROLES_LECTURA),
    acreditacionController.listarEntidadesDeEmpresa,
);
router.post(
    "/asignar",
    requireRole(ROLES_ESCRITURA),
    acreditacionController.asignarEntidad,
);
router.post(
    "/personas/:personaId/cambiar-proyecto",
    requireRole(ROLES_ESCRITURA),
    acreditacionController.cambiarProyectoPersona,
);
router.post(
    "/recursos/:recursoId/cambiar-proyecto",
    requireRole(ROLES_ESCRITURA),
    acreditacionController.cambiarProyectoRecurso,
);

module.exports = router;
