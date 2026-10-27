const {defineSecret} = require("firebase-functions/params");

// Clave maestra (32 bytes en base64) con la que se cifra la API key de
// Anthropic. Secreto de Functions: local en functions/.secret.local; en los
// proyectos, con `firebase functions:secrets:set AI_CONFIG_ENCRYPTION_KEY`.
// Módulo aparte y sin dependencias de Firestore: index.js lo importa antes
// de inicializar Firebase Admin.
const AI_CONFIG_ENCRYPTION_KEY = defineSecret("AI_CONFIG_ENCRYPTION_KEY");

module.exports = {AI_CONFIG_ENCRYPTION_KEY};
