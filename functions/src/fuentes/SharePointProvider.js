const {
  DocumentSourceProvider, NotImplementedError,
} = require("./DocumentSourceProvider");

const MENSAJE = "Conexión SharePoint disponible en la próxima versión";

/**
 * Fuente SharePoint (Microsoft Graph, permiso de aplicación Sites.Selected,
 * solo lectura). Pendiente: obtener el token con las credenciales de
 * FuenteDocumentalService.obtenerCredenciales, resolver siteId y driveId
 * (guardarlos en config) y recorrer la biblioteca desde la ruta base.
 *
 * Flujo previsto: listarCarpetas/listarArchivos arman el MISMO árbol de
 * metadatos que hoy envía el navegador ({nombre, ruta, carpetas, archivos})
 * y se pasa a estructuraRevisionService.analizar (detección de empresas,
 * completitud contra la plantilla y archivos para la IA). Luego, para cada
 * archivo del plan, descargar(itemId) entrega el Buffer que recibe
 * procesamientoService.procesarDocumento con el mismo archivoMeta y
 * contexto que hoy arma el navegador.
 */
class SharePointProvider extends DocumentSourceProvider {
  /**
   * @param {{config: Object, clientSecret: string}} credenciales
   *     Credenciales descifradas (solo backend).
   */
  constructor(credenciales) {
    super();
    this.credenciales = credenciales;
  }

  /** @override */
  async listarCarpetas() {
    throw new NotImplementedError(MENSAJE);
  }

  /** @override */
  async listarArchivos() {
    throw new NotImplementedError(MENSAJE);
  }

  /** @override */
  async descargar() {
    throw new NotImplementedError(MENSAJE);
  }
}

module.exports = {SharePointProvider};
