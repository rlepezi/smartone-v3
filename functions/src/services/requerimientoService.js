const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const perfilRequerimientoRepository =
    require("../repositories/perfilRequerimientoRepository");
const {TIPOS_ENTIDAD} = require("../utils/aplicabilidadRequerimiento");
const AppError = require("../utils/AppError");

// Catálogo oficial de tipos de entidad: fuente única de verdad, espejada a
// mano en frontend/src/services/requerimientoService.js ("recurso" se
// muestra como "Maquinaria").
const TIPOS_ENTIDAD_OPCIONES = [
  {value: "empresa", label: "Empresa"},
  {value: "persona", label: "Persona"},
  {value: "recurso", label: "Maquinaria"},
];

const ESTADOS_VALIDOS = ["activo", "inactivo"];
const NOMBRE_CORTO_MAX = 40;

// Roles cuya vista de uso queda acotada a su propio Mandante (como
// perfilRequerimientoService: no exponer vínculos de otros Mandantes).
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Reglas de negocio para el recurso Requerimiento. Catálogo global, sin
 * mandanteId ni lógica de alcance por actor — el control de acceso es
 * enteramente por rol a nivel de ruta (ver requerimientoRoutes.js). A qué
 * Perfiles de Recurso aplica NO es un dato del Requerimiento: lo define
 * cada vínculo Perfil-Requerimiento (`perfilRecursoId`).
 */
class RequerimientoService {
  /**
   * Valida y normaliza el nombre corto (obligatorio, máx. 40 caracteres).
   * @param {*} nombreCorto Valor recibido.
   * @return {string} Nombre corto con trim.
   */
  _validarNombreCorto(nombreCorto) {
    const valor = typeof nombreCorto === "string" ? nombreCorto.trim() : "";
    if (!valor) {
      throw new AppError(400, "El campo 'nombreCorto' es obligatorio.");
    }
    if (valor.length > NOMBRE_CORTO_MAX) {
      throw new AppError(
          400,
          `El nombre corto no puede exceder ${NOMBRE_CORTO_MAX} caracteres.`,
      );
    }
    return valor;
  }

  /**
   * Valida un tipo de entidad.
   * @param {*} tipoEntidad Valor recibido.
   * @return {void}
   */
  _validarTipoEntidad(tipoEntidad) {
    if (!TIPOS_ENTIDAD.includes(tipoEntidad)) {
      throw new AppError(
          400,
          `Tipo de entidad '${tipoEntidad}' no válido. ` +
          `Valores permitidos: ${TIPOS_ENTIDAD.join(", ")}.`,
      );
    }
  }

  /**
   * Obtiene un requerimiento por su ID.
   * @param {string} id ID del requerimiento.
   * @return {Promise<Object>} El requerimiento encontrado.
   */
  async getRequerimientoById(id) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de requerimiento inválido.");
    }
    const requerimiento = await requerimientoRepository.getById(id);
    if (!requerimiento) {
      throw new AppError(404, "Requerimiento no encontrado.");
    }
    return requerimiento;
  }

  /**
   * Lista requerimientos, opcionalmente filtrados por estado y/o tipo de
   * entidad.
   * @param {Object} filtros Filtros de búsqueda.
   * @return {Promise<Object[]>} Lista de requerimientos.
   */
  async listarRequerimientos(filtros) {
    return await requerimientoRepository.list(filtros);
  }

  /**
   * Uso de cada Requerimiento por Mandante: qué Mandantes distintos lo tienen
   * vinculado (vínculo activo Perfil-Requerimiento) a alguno de sus Perfiles de
   * Participación. El Requerimiento es un catálogo global, así que esto es un
   * conteo de uso y no un Mandante único por fila. Única fuente de la columna
   * "Mandantes" y del filtro por Mandante del listado. Un mandante_admin/lector
   * solo ve su propio Mandante.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} Mapa requerimientoId -> mandanteIds[].
   */
  async obtenerUsoPorMandante(actor) {
    const filtros = {estado: "activo"};
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol)) {
      filtros.mandanteId = actor.mandanteId;
    }
    const vinculos = await perfilRequerimientoRepository.list(filtros);
    const uso = {};
    vinculos.forEach((v) => {
      if (!v.requerimientoId || !v.mandanteId) return;
      if (!uso[v.requerimientoId]) uso[v.requerimientoId] = new Set();
      uso[v.requerimientoId].add(v.mandanteId);
    });
    const resultado = {};
    Object.entries(uso).forEach(([id, set]) => {
      resultado[id] = [...set];
    });
    return resultado;
  }

  /**
   * Crea un nuevo requerimiento.
   * @param {Object} payload Datos del nuevo requerimiento.
   * @return {Promise<Object>} El requerimiento creado.
   */
  async crearRequerimiento(payload) {
    // TODO: instrumentar auditoría si se decide más adelante.
    const {
      nombre, nombreCorto, descripcion, tipoEntidad, estado,
      requiereVencimiento, esDocumentoIdentidad,
    } = payload;

    if (!nombre || !tipoEntidad) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'nombre', 'nombreCorto' y " +
          "'tipoEntidad' son requeridos.",
      );
    }
    this._validarTipoEntidad(tipoEntidad);
    const nombreCortoFinal = this._validarNombreCorto(nombreCorto);

    const duplicado = await requerimientoRepository.getByNombreYTipo(
        nombre.trim(), tipoEntidad,
    );
    if (duplicado) {
      throw new AppError(
          409,
          `Ya existe un Requerimiento con el nombre '${nombre}' para el ` +
          `tipo '${tipoEntidad}'.`,
      );
    }

    const estadoFinal = estado || "activo";
    if (!ESTADOS_VALIDOS.includes(estadoFinal)) {
      throw new AppError(
          400,
          `Estado '${estadoFinal}' no válido. ` +
          `Valores permitidos: ${ESTADOS_VALIDOS.join(", ")}.`,
      );
    }

    const nuevoRequerimiento = {
      nombre: nombre.trim(),
      nombreCorto: nombreCortoFinal,
      descripcion: descripcion ? descripcion.trim() : null,
      tipoEntidad,
      estado: estadoFinal,
      requiereVencimiento: Boolean(requiereVencimiento),
      // Clasificación manual: su Evidencia típica es un documento de
      // identidad (cédula, licencia). Nunca se infiere por el nombre. Solo
      // tiene sentido para Personas.
      esDocumentoIdentidad:
          tipoEntidad === "persona" && Boolean(esDocumentoIdentidad),
    };

    return await requerimientoRepository.create(nuevoRequerimiento);
  }

  /**
   * Actualiza los campos editables de un requerimiento existente. El
   * `tipoEntidad` no puede cambiar mientras el Requerimiento tenga vínculos
   * activos (cada vínculo copia el tipo y puede apuntar a un Perfil de
   * Recurso de ese tipo).
   * @param {string} id ID del requerimiento.
   * @param {Object} payload Campos a actualizar.
   * @return {Promise<Object|null>} El requerimiento actualizado.
   */
  async actualizarRequerimiento(id, payload) {
    const existente = await this.getRequerimientoById(id);

    const allowedFields = [
      "nombre", "nombreCorto", "descripcion", "tipoEntidad", "estado",
      "requiereVencimiento", "esDocumentoIdentidad",
    ];
    const updateData = {};
    for (const key of allowedFields) {
      if (payload[key] !== undefined) {
        updateData[key] = payload[key];
      }
    }

    if (updateData.tipoEntidad !== undefined) {
      this._validarTipoEntidad(updateData.tipoEntidad);
      if (updateData.tipoEntidad !== existente.tipoEntidad) {
        const vinculos =
            await perfilRequerimientoRepository.getActivosByRequerimiento(id);
        if (vinculos.length > 0) {
          throw new AppError(
              409,
              "No se puede cambiar el tipo de un Requerimiento que tiene " +
              "vínculos activos con Perfiles de Participación.",
          );
        }
      }
    }

    if (updateData.nombreCorto !== undefined) {
      updateData.nombreCorto = this._validarNombreCorto(updateData.nombreCorto);
    }

    if (updateData.estado && !ESTADOS_VALIDOS.includes(updateData.estado)) {
      throw new AppError(400, `Estado '${updateData.estado}' no válido.`);
    }

    const tipoFinal = updateData.tipoEntidad ?? existente.tipoEntidad;
    if (updateData.esDocumentoIdentidad !== undefined ||
        updateData.tipoEntidad !== undefined) {
      const marcado = updateData.esDocumentoIdentidad !== undefined ?
          updateData.esDocumentoIdentidad : existente.esDocumentoIdentidad;
      updateData.esDocumentoIdentidad =
          tipoFinal === "persona" && Boolean(marcado);
    }

    if (updateData.requiereVencimiento !== undefined) {
      updateData.requiereVencimiento = Boolean(updateData.requiereVencimiento);
    }

    const nombreFinal = updateData.nombre !== undefined ?
        updateData.nombre.trim() : existente.nombre;
    if (nombreFinal !== existente.nombre ||
        tipoFinal !== existente.tipoEntidad) {
      const duplicado = await requerimientoRepository.getByNombreYTipo(
          nombreFinal, tipoFinal,
      );
      if (duplicado && duplicado.id !== id) {
        throw new AppError(
            409,
            `Ya existe un Requerimiento con el nombre '${nombreFinal}' ` +
            `para el tipo '${tipoFinal}'.`,
        );
      }
    }

    if (updateData.nombre) updateData.nombre = updateData.nombre.trim();
    if (updateData.descripcion !== undefined) {
      updateData.descripcion = updateData.descripcion ?
          updateData.descripcion.trim() : null;
    }

    return await requerimientoRepository.update(id, updateData);
  }

  /**
   * Desactiva un requerimiento existente.
   * @param {string} id ID del requerimiento.
   * @return {Promise<Object|null>} El requerimiento desactivado.
   */
  async desactivarRequerimiento(id) {
    await this.getRequerimientoById(id);
    return await requerimientoRepository.setEstado(id, "inactivo");
  }
}

module.exports = new RequerimientoService();
module.exports.TIPOS_ENTIDAD_OPCIONES = TIPOS_ENTIDAD_OPCIONES;
