const mandanteRepository = require("../repositories/mandanteRepository");
const {validateRut, cleanRut} = require("../utils/rutValidator");
const AppError = require("../utils/AppError");

const ESTADOS_VALIDOS = ["activo", "inactivo", "bloqueado"];
const TELEFONO_MAX_DIGITOS = 11;

/**
 * Reglas de negocio para el recurso Mandante.
 */
class MandanteService {
  /**
   * Valida que contacto.telefono sea SOLO dígitos (sin "+", espacios,
   * guiones ni paréntesis) y de máximo TELEFONO_MAX_DIGITOS caracteres.
   * @param {?string} telefono Teléfono a validar, o null/undefined.
   * @return {void}
   */
  _validarTelefono(telefono) {
    if (!telefono) return;
    const patron = new RegExp(`^\\d{1,${TELEFONO_MAX_DIGITOS}}$`);
    if (!patron.test(telefono)) {
      throw new AppError(
          400,
          "El teléfono debe contener solo números, sin espacios ni " +
          "símbolos, máximo 11 dígitos.",
      );
    }
  }

  /**
   * Obtiene un mandante por su ID, lanzando si no existe.
   *
   * El módulo Mandante es CRUD completo para superadmin y admin_comercial
   * (personal SmartApplication dedicado a la gestión comercial de
   * clientes). Excepciones acotadas a este método: superadmin, evaluador y
   * admin_comercial pueden consultar cualquier Mandante sin restricción
   * (evaluador tiene el mismo alcance transversal que ya tiene en todos
   * los demás módulos); mandante_admin/mandante_lector SOLO pueden
   * consultar su propio mandanteId — 403 si intentan uno ajeno (a
   * diferencia de otros módulos, acá sí se rechaza con 403 y no con 404:
   * es una decisión deliberada para este endpoint puntual).
   * @param {string} id ID del mandante.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<object>} El mandante encontrado.
   */
  async getMandanteById(id, actor) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de mandante inválido.");
    }
    const ROLES_SIN_RESTRICCION = [
      "superadmin", "evaluador", "admin_comercial",
    ];
    if (
      !ROLES_SIN_RESTRICCION.includes(actor.rol) &&
      id !== actor.mandanteId
    ) {
      throw new AppError(
          403, "No tiene permisos para consultar este Mandante.",
      );
    }
    const mandante = await mandanteRepository.getById(id);
    if (!mandante) {
      throw new AppError(404, "Mandante no encontrado.");
    }
    return mandante;
  }

  /**
   * Lista mandantes, opcionalmente filtrados.
   * @param {object} filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de mandantes.
   */
  async listarMandantes(filtros) {
    return await mandanteRepository.list(filtros);
  }

  /**
   * Crea un nuevo mandante, validando unicidad de RUT y campos requeridos.
   * @param {object} payload Datos del nuevo mandante.
   * @return {Promise<object>} El mandante creado.
   */
  async crearMandante(payload) {
    // TODO: instrumentar auditoría si se decide más adelante.
    const {
      rut,
      razonSocial,
      nombreFantasia,
      contacto,
      configuracion,
      estado,
    } = payload;

    // 1. Validar obligatorios básicos
    if (!rut || !razonSocial || !razonSocial.trim()) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'rut' y 'razonSocial' son requeridos.",
      );
    }

    // 2. Validar y normalizar RUT
    if (!validateRut(rut)) {
      throw new AppError(400, `El RUT proporcionado (${rut}) no es válido.`);
    }
    const rutNormalized = cleanRut(rut);

    // 3. Unicidad de RUT
    const existente = await mandanteRepository.getByRut(rutNormalized);
    if (existente) {
      throw new AppError(
          409,
          `Ya existe un Mandante registrado con el RUT ${rutNormalized}.`,
      );
    }

    // 4. Validar estado si viene
    const estadoFinal = estado || "activo";
    if (!ESTADOS_VALIDOS.includes(estadoFinal)) {
      throw new AppError(
          400,
          `Estado '${estadoFinal}' no válido. ` +
          `Valores permitidos: ${ESTADOS_VALIDOS.join(", ")}.`,
      );
    }

    // 5. Validar contacto si viene
    let contactoFinal = null;
    if (contacto) {
      if (!contacto.nombre || !contacto.email) {
        throw new AppError(
            400,
            "Si se incluye información de contacto, 'nombre' y 'email' " +
            "son requeridos.",
        );
      }
      this._validarTelefono(contacto.telefono);
      contactoFinal = {
        nombre: contacto.nombre.trim(),
        email: contacto.email.trim().toLowerCase(),
        telefono: contacto.telefono ? contacto.telefono.trim() : null,
      };
    }

    const nuevoMandante = {
      rut: rutNormalized,
      razonSocial: razonSocial.trim(),
      // Opcional: el nombre a mostrar cae a razonSocial si viene vacío (ver
      // utils/mandanteDisplay.js).
      nombreFantasia: nombreFantasia?.trim() || null,
      estado: estadoFinal,
      contacto: contactoFinal,
      configuracion: {
        zonaHoraria: configuracion?.zonaHoraria || "America/Santiago",
      },
      logoUrl: null,
    };

    return await mandanteRepository.create(nuevoMandante);
  }

  /**
   * Actualiza los campos editables de un mandante existente.
   *
   * superadmin puede editar todos los campos. mandante_admin puede llamar
   * este mismo método pero acotado a autogestión: solo su propio
   * mandanteId (ya forzado por getMandanteById) y solo los campos
   * nombreFantasia/contacto/configuracion.zonaHoraria/logoUrl — cualquier
   * otro campo del payload (razonSocial, rut, estado) se ignora en
   * silencio, sin romper la petición.
   * @param {string} id ID del mandante.
   * @param {object} payload Campos a actualizar.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<object|null>} El mandante actualizado.
   */
  async actualizarMandante(id, payload, actor) {
    await this.getMandanteById(id, actor); // Verifica existencia y alcance

    const updateData = {};

    if (actor.rol === "mandante_admin") {
      if (payload.nombreFantasia !== undefined) {
        updateData.nombreFantasia = payload.nombreFantasia;
      }
      if (payload.contacto !== undefined) {
        this._validarTelefono(payload.contacto?.telefono);
        updateData.contacto = payload.contacto;
      }
      if (payload.configuracion !== undefined) {
        updateData.configuracion = {
          zonaHoraria: payload.configuracion?.zonaHoraria,
        };
      }
      if (payload.logoUrl !== undefined) {
        updateData.logoUrl = payload.logoUrl;
      }
      return await mandanteRepository.update(id, updateData);
    }

    const allowedFields = [
      "razonSocial",
      "nombreFantasia",
      "contacto",
      "configuracion",
      "estado",
      "logoUrl",
    ];

    for (const key of allowedFields) {
      if (payload[key] !== undefined) {
        updateData[key] = payload[key];
      }
    }

    // Validar estado si se intenta modificar
    if (updateData.estado && !ESTADOS_VALIDOS.includes(updateData.estado)) {
      throw new AppError(400, `Estado '${updateData.estado}' no válido.`);
    }

    if (updateData.contacto !== undefined) {
      this._validarTelefono(updateData.contacto?.telefono);
    }

    // No permitir cambiar RUT directamente por este método
    if (payload.rut) {
      throw new AppError(
          400,
          "El RUT del Mandante no puede ser modificado directamente.",
      );
    }

    return await mandanteRepository.update(id, updateData);
  }

  /**
   * Desactiva (borrado lógico) un mandante existente.
   * @param {string} id ID del mandante.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<object|null>} El mandante desactivado.
   */
  async desactivarMandante(id, actor) {
    await this.getMandanteById(id, actor);
    return await mandanteRepository.setEstado(id, "inactivo");
  }
}

module.exports = new MandanteService();
