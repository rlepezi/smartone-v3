const {defineSecret} = require("firebase-functions/params");
const {Resend} = require("resend");

// Secret de Cloud Functions (Gen 2) — el valor real NUNCA vive en el
// código ni en variables de entorno en texto plano: Google Secret
// Manager lo entrega cifrado al runtime. Se configura una sola vez,
// fuera de este repositorio, con:
//   firebase functions:secrets:set RESEND_API_KEY
// Toda Cloud Function que dispare un correo (directa o indirectamente,
// vía este servicio) debe declarar `secrets: [RESEND_API_KEY]` en sus
// opciones (ver index.js) — si no, `RESEND_API_KEY.value()` no tiene
// nada que leer en tiempo de ejecución.
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

// Remitente por defecto: el dominio de prueba de Resend (sin verificar
// nada), válido mientras no haya un dominio propio verificado en la
// cuenta. Ese dominio de prueba solo entrega correos a la dirección con
// la que se creó la cuenta de Resend — para otros destinatarios (ej.
// varios superadmin con correos distintos) hace falta un dominio propio
// verificado; cuando exista, se cambia aquí, en un solo lugar.
const REMITENTE_POR_DEFECTO = "onboarding@resend.dev";

/**
 * Envío de correo — única capa del proyecto que importa el paquete
 * `resend`. Cualquier otro servicio que necesite enviar un correo (ej.
 * `respaldoNotificacionService`) llama a esta función, nunca a Resend
 * directamente.
 * @param {{to: (string|string[]), subject: string, html: string,
 *     from: ?string}} correo Destinatario(s), asunto, cuerpo HTML y
 *     remitente opcional.
 * @return {Promise<object>} El dato de la respuesta de Resend (id del
 *     envío, etc.).
 */
async function enviarCorreo({to, subject, html, from}) {
  const destinatarios = Array.isArray(to) ? to : [to];
  if (destinatarios.length === 0) {
    throw new Error("enviarCorreo: se requiere al menos un destinatario.");
  }

  const resend = new Resend(RESEND_API_KEY.value());
  const {data, error} = await resend.emails.send({
    from: from || REMITENTE_POR_DEFECTO,
    to: destinatarios,
    subject,
    html,
  });

  if (error) {
    console.error("[emailService] Error enviando correo:", error);
    throw new Error(error.message || "Resend rechazó el envío del correo.");
  }
  return data;
}

module.exports = {enviarCorreo, RESEND_API_KEY};
