const admin = require("firebase-admin");

/**
 * Middleware para validar autenticación vía Firebase Auth y extraer
 * contexto multi-tenant.
 * Inyecta en req.user: { uid, email, mandanteId, rol, ... }
 * @param {Object} req Objeto de petición de Express.
 * @param {Object} res Objeto de respuesta de Express.
 * @param {Function} next Siguiente middleware.
 * @return {Promise<void>}
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Unauthorized",
        message:
          "No se proporcionó un token de autorización válido (Bearer Token).",
      });
    }

    const token = authHeader.split("Bearer ")[1].trim();

    // 1. Verificar firma y vigencia del JWT con Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(token);
    const {uid, email} = decodedToken;

    // 2. Extraer mandanteId y rol desde Custom Claims si existen
    let mandanteId = decodedToken.mandanteId || null;
    let rol = decodedToken.rol || "usuario";

    // 3. Fallback: solo si el token nunca tuvo Custom Claims asignados
    //    (cuenta legacy o recién creada antes del próximo refresh de token).
    //    No se usa "!mandanteId" porque superadmin/evaluador tienen
    //    mandanteId legítimamente null y no deben pagar una lectura extra
    //    a Firestore en cada request.
    if (decodedToken.rol === undefined) {
      const userDoc = await admin.firestore()
          .collection("usuarios").doc(uid).get();

      if (userDoc.exists) {
        const userData = userDoc.data();
        mandanteId = userData.mandanteId || null;
        rol = userData.rol || rol;
      }
    }

    // 4. Inyectar datos del usuario autenticado en la request
    req.user = {
      uid,
      email,
      mandanteId,
      rol,
      claims: decodedToken,
    };

    next();
  } catch (error) {
    console.error("❌ Error en autenticación de token:", error.message);

    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({
        error: "TokenExpired",
        message:
          "El token de autenticación ha expirado. " +
          "Por favor, inicie sesión nuevamente.",
      });
    }

    return res.status(401).json({
      error: "Unauthorized",
      message: "Token de autenticación inválido o revocado.",
    });
  }
};

/**
 * Middleware complementario: Exige que la petición posea un mandanteId
 * resuelto. Evita operaciones operacionales huérfanas de contexto de cliente.
 * @param {Object} req Objeto de petición de Express.
 * @param {Object} res Objeto de respuesta de Express.
 * @param {Function} next Siguiente middleware.
 * @return {void}
 */
const requireMandante = (req, res, next) => {
  if (!req.user || !req.user.mandanteId) {
    return res.status(403).json({
      error: "ForbiddenTenant",
      message:
        "El usuario autenticado no tiene un Mandante asociado para operar.",
    });
  }
  next();
};

/**
 * Middleware complementario: Control de acceso basado en roles (RBAC).
 * @param {string[]} rolesPermitidos Lista de roles autorizados
 *     (ej: ['admin', 'evaluador'])
 * @return {Function} Middleware de Express.
 */
const requireRole = (rolesPermitidos = []) => {
  return (req, res, next) => {
    if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({
        error: "ForbiddenRole",
        message: "No posee los permisos necesarios para realizar esta acción.",
      });
    }
    next();
  };
};

module.exports = {
  authMiddleware,
  requireMandante,
  requireRole,
};
