const usuarioRepository = require("../repositories/usuarioRepository");
const volumenDatosRepository =
    require("../repositories/volumenDatosRepository");
const {enviarCorreo} = require("./emailService");
const {formatearFecha, formatearFechaHora} = require("../utils/dateFormat");

const ETIQUETA_COLECCION = {
  mandantes: "Mandantes",
  proyectos: "Proyectos",
  empresas: "Empresas",
  personas: "Personas",
  recursos: "Maquinarias",
  participaciones: "Participaciones",
  expedientes: "Expedientes",
  evaluaciones: "Evaluaciones",
};

/**
 * Notificación por correo de respaldos correctos de Firestore. Se dispara
 * desde `respaldoService.refrescarOperaciones` (único punto donde un
 * respaldo pasa de "en_progreso" a "exitoso"), así que cubre tanto el
 * respaldo automático programado como el manual sin duplicar lógica —
 * ambos terminan pasando por ese mismo método.
 */
class RespaldoNotificacionService {
  /**
   * Formatea bytes en una unidad legible.
   * @param {?number} bytes Tamaño en bytes.
   * @return {string} Tamaño formateado, o "—" si no se pudo calcular.
   */
  _formatoTamano(bytes) {
    if (bytes === null || bytes === undefined) return "—";
    if (bytes < 1024) return `${bytes} B`;
    const unidades = ["KB", "MB", "GB", "TB"];
    let valor = bytes / 1024;
    let i = 0;
    while (valor >= 1024 && i < unidades.length - 1) {
      valor /= 1024;
      i++;
    }
    return `${valor.toFixed(1)} ${unidades[i]}`;
  }

  /**
   * Formatea la duración entre dos Timestamps.
   * @param {*} inicio Timestamp de inicio.
   * @param {*} fin Timestamp de fin.
   * @return {string} Duración formateada, o "—" si falta algún dato.
   */
  _formatoDuracion(inicio, fin) {
    const msInicio = inicio?.toMillis?.() || null;
    const msFin = fin?.toMillis?.() || null;
    if (!msInicio || !msFin) return "—";
    const seg = Math.max(0, Math.round((msFin - msInicio) / 1000));
    if (seg < 60) return `${seg} s`;
    return `${Math.floor(seg / 60)} min ${seg % 60} s`;
  }

  /**
   * Una fila `{etiqueta}: {valor}` de la tabla de datos del respaldo.
   * @param {string} etiqueta Etiqueta de la fila.
   * @param {string} valor Valor, ya formateado.
   * @param {boolean} monoespaciado Si el valor va en fuente monoespaciada
   *     (p. ej. la ubicación del bucket).
   * @return {string} Fila `<tr>` en HTML.
   */
  _filaDato(etiqueta, valor, monoespaciado = false) {
    const fuente =
        monoespaciado ? "font-family:monospace;" : "font-weight:bold;";
    return "<tr>" +
        `<td style="padding:2px 12px 2px 0;color:#6b7280;">${etiqueta}</td>` +
        `<td style="padding:2px 0;${fuente}">${valor}</td>` +
        "</tr>";
  }

  /**
   * Una fila `{colección}: {total}` de la tabla de volumen de datos.
   * @param {string} coleccion Nombre técnico de la colección.
   * @param {?number} total Cantidad de documentos, o null si falló.
   * @return {string} Fila `<tr>` en HTML.
   */
  _filaConteo(coleccion, total) {
    const borde = "border-bottom:1px solid #e5e7eb;";
    const nombre = ETIQUETA_COLECCION[coleccion] || coleccion;
    const valor = total === null ? "—" : total.toLocaleString("es-CL");
    return "<tr>" +
        `<td style="padding:4px 12px;${borde}">${nombre}</td>` +
        `<td style="padding:4px 12px;${borde}text-align:right;">${valor}</td>` +
        "</tr>";
  }

  /**
   * Arma el HTML simple del correo: encabezado con los datos del
   * respaldo y una tabla con el conteo por colección.
   * @param {object} registro Registro del respaldo, ya con estado
   *     "exitoso".
   * @param {Object[]} conteos [{coleccion, total}] del snapshot.
   * @return {string} Cuerpo HTML del correo.
   */
  _armarHtml(registro, conteos) {
    const filasConteo = conteos
        .map(({coleccion, total}) => this._filaConteo(coleccion, total))
        .join("");
    const tipo = registro.iniciadoPor === "sistema" ? "Automático" : "Manual";
    const fechaHora =
        formatearFechaHora(registro.fechaFin || registro.fechaInicio);
    const tamano = this._formatoTamano(registro.tamanoBytes);
    const duracion =
        this._formatoDuracion(registro.fechaInicio, registro.fechaFin);
    const filasDatos = [
      this._filaDato("Fecha y hora", fechaHora),
      this._filaDato("Tipo", tipo),
      this._filaDato("Tamaño", tamano),
      this._filaDato("Duración", duracion),
      this._filaDato("Ubicación", registro.bucketDestino || "—", true),
    ].join("");

    return "<div style=\"font-family:Arial,sans-serif;font-size:14px;" +
        "color:#1f2937;\">" +
        "<h2 style=\"margin-bottom:4px;\">" +
        "Respaldo de la base de datos — Correcto</h2>" +
        "<p style=\"color:#6b7280;margin-top:0;\">SmartOne v3</p>" +
        "<table style=\"border-collapse:collapse;margin-bottom:20px;\">" +
        filasDatos + "</table>" +
        "<h3 style=\"margin-bottom:8px;\">" +
        "Volumen de datos al momento del respaldo</h3>" +
        "<table style=\"border-collapse:collapse;\"><thead><tr>" +
        "<th style=\"padding:4px 12px;border-bottom:2px solid #1f2937;" +
        "text-align:left;\">Colección</th>" +
        "<th style=\"padding:4px 12px;border-bottom:2px solid #1f2937;" +
        "text-align:right;\">Documentos</th>" +
        "</tr></thead><tbody>" + filasConteo + "</tbody></table></div>";
  }

  /**
   * Notifica por correo a los superadmin que un respaldo terminó
   * correctamente. Nunca lanza: un correo es siempre secundario al
   * respaldo mismo, que ya se hizo con éxito.
   * @param {object} registro Registro del respaldo (tipo "respaldo",
   *     estado "exitoso").
   * @return {Promise<{enviado: boolean, destinatarios: string[],
   *     error: ?string}>} Resultado del intento — nunca lanza, para que
   *     el llamador (`respaldoService.refrescarOperaciones`) pueda
   *     esperarlo sin arriesgar el registro del respaldo, pero también
   *     pueda guardar constancia de si el correo realmente salió (la
   *     única forma de diagnosticar esto sin acceso a Cloud Logging).
   */
  async notificarRespaldoExitoso(registro) {
    let destinatarios = [];
    try {
      destinatarios =
          await usuarioRepository.listarCorreosPorRol("superadmin");
      if (destinatarios.length === 0) {
        console.warn(
            "⚠️ No hay ningún superadmin con correo válido: no se " +
            "envía la notificación de respaldo.",
        );
        return {enviado: false, destinatarios, error: "sin_superadmin"};
      }
      const conteos = await volumenDatosRepository.contarColeccionesResumen();
      const fecha = formatearFecha(registro.fechaFin || registro.fechaInicio);
      await enviarCorreo({
        to: destinatarios,
        subject: `Respaldo SmartOne v3 — [Correcto] — ${fecha}`,
        html: this._armarHtml(registro, conteos),
      });
      return {enviado: true, destinatarios, error: null};
    } catch (error) {
      console.error(
          "⚠️ No se pudo notificar el respaldo exitoso:", error.message,
      );
      return {enviado: false, destinatarios, error: error.message};
    }
  }
}

module.exports = new RespaldoNotificacionService();
