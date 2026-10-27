// Punto de extensión de las fuentes documentales del backend. Hoy los
// archivos llegan desde el navegador (carpeta local) y se procesan con
// procesamientoService.procesarDocumento, que no sabe de dónde vienen. Una
// fuente del backend (SharePoint) implementará esta interfaz: el servicio
// de revisiones listará las carpetas (una por RUT), listará sus archivos,
// los descargará como Buffer y llamará a procesarDocumento con el mismo
// archivoMeta (rutaRelativa, nombre, mime, tamaño, hash) que hoy envía el
// navegador.

/**
 * Error de una capacidad aún no disponible.
 */
class NotImplementedError extends Error {
  /**
   * @param {string} mensaje Mensaje.
   */
  constructor(mensaje) {
    super(mensaje);
    this.name = "NotImplementedError";
    this.status = 501;
  }
}

/**
 * Interfaz de una fuente documental del backend.
 */
class DocumentSourceProvider {
  /**
   * Carpetas de primer nivel (una por persona) bajo la ruta base.
   * @param {string} rutaBase Ruta base normalizada ("Acreditacion/").
   * @return {Promise<Array<{id: string, nombre: string}>>} Carpetas.
   */
  async listarCarpetas(rutaBase) {
    throw new NotImplementedError("listarCarpetas no implementado.");
  }

  /**
   * Archivos directos de una carpeta.
   * @param {{id: string, nombre: string}} carpeta Carpeta.
   * @return {Promise<Array<{id: string, nombre: string, mime: string,
   *     tamanoBytes: number, ultimaModificacion: ?string}>>} Archivos.
   */
  async listarArchivos(carpeta) {
    throw new NotImplementedError("listarArchivos no implementado.");
  }

  /**
   * Descarga un archivo.
   * @param {string} itemId ID del archivo en la fuente.
   * @return {Promise<Buffer>} Contenido.
   */
  async descargar(itemId) {
    throw new NotImplementedError("descargar no implementado.");
  }
}

module.exports = {DocumentSourceProvider, NotImplementedError};
