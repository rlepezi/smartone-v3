const empresaRepository = require("../repositories/empresaRepository");
const personaRepository = require("../repositories/personaRepository");
const recursoRepository = require("../repositories/recursoRepository");
const participacionRepository =
    require("../repositories/participacionRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const mandanteRepository = require("../repositories/mandanteRepository");
const perfilParticipacionRepository =
    require("../repositories/perfilParticipacionRepository");
const {validateRut, cleanRut} = require("../utils/rutValidator");
const reporteService = require("./reporteService");
const bitacoraService = require("./bitacoraService");
const asignacionRepository = require("../repositories/asignacionRepository");
const AppError = require("../utils/AppError");
const {getMandanteDisplayName} = require("../utils/mandanteDisplay");

const ESTADOS_VALIDOS = ["activo", "inactivo"];
const TELEFONO_MAX_DIGITOS = 11;

/**
 * Reglas de negocio para el recurso Empresa.
 * Catálogo global compartido entre Mandantes (RN-021): no lleva mandanteId
 * ni lógica de alcance por actor — el control de acceso es enteramente por
 * rol a nivel de ruta (ver empresaRoutes.js).
 */
class EmpresaService {
  /**
   * Valida que contacto.telefono sea SOLO dígitos (sin "+", espacios,
   * guiones ni paréntesis) y de máximo TELEFONO_MAX_DIGITOS caracteres.
   * Mismo criterio que mandanteService.js.
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
   * Obtiene una empresa por su ID.
   * @param {string} id ID de la empresa.
   * @return {Promise<Object>} La empresa encontrada.
   */
  async getEmpresaById(id) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de empresa inválido.");
    }
    const empresa = await empresaRepository.getById(id);
    if (!empresa) {
      throw new AppError(404, "Empresa no encontrada.");
    }
    return empresa;
  }

  /**
   * Lista empresas, opcionalmente filtradas por estado.
   * TODO: cuando exista el módulo Participación, permitir filtrar por
   * "empresas que participan en al menos un proyecto de mi Mandante" —
   * esa relación no existe todavía, no se implementa ahora.
   * @param {Object} filtros Filtros de búsqueda.
   * @return {Promise<Object[]>} Lista de empresas.
   */
  async listarEmpresas(filtros) {
    return await empresaRepository.list(filtros);
  }

  /**
   * Crea una nueva empresa.
   * @param {Object} payload Datos de la nueva empresa.
   * @return {Promise<Object>} La empresa creada.
   */
  async crearEmpresa(payload) {
    // TODO: instrumentar auditoría si se decide más adelante.
    const {rut, razonSocial, nombreFantasia, giro, contacto, estado} =
        payload;

    if (!rut || !razonSocial || !giro) {
      throw new AppError(
          400,
          "Faltan campos obligatorios: 'rut', 'razonSocial' y 'giro' " +
          "son requeridos.",
      );
    }

    if (!validateRut(rut)) {
      throw new AppError(400, `El RUT proporcionado (${rut}) no es válido.`);
    }
    const rutNormalizado = cleanRut(rut);

    const existente = await empresaRepository.getByRut(rutNormalizado);
    if (existente) {
      throw new AppError(
          409,
          `Ya existe una Empresa registrada con el RUT ${rutNormalizado}.`,
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

    let contactoFinal = null;
    if (contacto) {
      if (!contacto.nombre && !contacto.email && !contacto.telefono) {
        throw new AppError(
            400,
            "Si se incluye información de contacto, debe proporcionar " +
            "al menos uno de: 'nombre', 'email' o 'telefono'.",
        );
      }
      this._validarTelefono(contacto.telefono);
      contactoFinal = {
        nombre: contacto.nombre ? contacto.nombre.trim() : null,
        email: contacto.email ? contacto.email.trim().toLowerCase() : null,
        telefono: contacto.telefono ? contacto.telefono.trim() : null,
      };
    }

    const nuevaEmpresa = {
      rut: rutNormalizado,
      razonSocial: razonSocial.trim(),
      nombreFantasia: (nombreFantasia || razonSocial).trim(),
      giro: giro.trim(),
      contacto: contactoFinal,
      estado: estadoFinal,
      logoUrl: null,
    };

    return await empresaRepository.create(nuevaEmpresa);
  }

  /**
   * Actualiza los campos editables de una empresa existente.
   * @param {string} id ID de la empresa.
   * @param {Object} payload Campos a actualizar.
   * @return {Promise<Object|null>} La empresa actualizada.
   */
  async actualizarEmpresa(id, payload) {
    await this.getEmpresaById(id); // Verifica existencia

    const allowedFields = [
      "razonSocial", "nombreFantasia", "giro", "contacto", "estado",
      "logoUrl",
    ];
    const updateData = {};
    for (const key of allowedFields) {
      if (payload[key] !== undefined) {
        updateData[key] = payload[key];
      }
    }

    if (updateData.estado && !ESTADOS_VALIDOS.includes(updateData.estado)) {
      throw new AppError(400, `Estado '${updateData.estado}' no válido.`);
    }

    // El RUT no puede cambiarse directamente por este método.
    if (payload.rut) {
      throw new AppError(
          400,
          "El RUT de la Empresa no puede ser modificado directamente.",
      );
    }

    if (updateData.razonSocial) {
      updateData.razonSocial = updateData.razonSocial.trim();
    }
    if (updateData.nombreFantasia) {
      updateData.nombreFantasia = updateData.nombreFantasia.trim();
    }
    if (updateData.giro) updateData.giro = updateData.giro.trim();

    if (updateData.contacto) {
      const contacto = updateData.contacto;
      if (!contacto.nombre && !contacto.email && !contacto.telefono) {
        throw new AppError(
            400,
            "Si se incluye información de contacto, debe proporcionar " +
            "al menos uno de: 'nombre', 'email' o 'telefono'.",
        );
      }
      this._validarTelefono(contacto.telefono);
      updateData.contacto = {
        nombre: contacto.nombre ? contacto.nombre.trim() : null,
        email: contacto.email ? contacto.email.trim().toLowerCase() : null,
        telefono: contacto.telefono ? contacto.telefono.trim() : null,
      };
    }

    return await empresaRepository.update(id, updateData);
  }

  /**
   * Desactiva una empresa existente.
   * @param {string} id ID de la empresa.
   * @return {Promise<Object|null>} La empresa desactivada.
   */
  async desactivarEmpresa(id) {
    await this.getEmpresaById(id);
    return await empresaRepository.setEstado(id, "inactivo");
  }

  /**
   * Calcula, en una sola llamada, los contadores de Personas, Recursos y
   * Proyectos (distintos, vía Participación activa) de una Empresa.
   * @param {string} id ID de la empresa.
   * @return {Promise<{personasCount: number, recursosCount: number,
   *     proyectosCount: number}>} Los contadores calculados.
   */
  async obtenerResumen(id) {
    await this.getEmpresaById(id); // Verifica existencia

    const [personas, recursos, participaciones] = await Promise.all([
      personaRepository.list({empresaId: id}),
      recursoRepository.list({empresaId: id}),
      participacionRepository.list({empresaId: id}),
    ]);

    const participacionesActivas = participaciones.filter(
        (p) => p.estado === "activa",
    );
    const proyectosActivos = new Set(
        participacionesActivas.map((p) => p.proyectoId),
    );

    // Detalle por participación activa (Proyecto + Perfil de
    // Participación asociado) — para la columna "Proyecto/Perfil" y el
    // panel lateral de EmpresasListPage.jsx, que necesitan el nombre, no
    // solo el conteo. Una Empresa activa normalmente tiene 0-2
    // participaciones simultáneas, así que resolver cada Proyecto/Perfil
    // por separado (sin `in` batching) es aceptable acá.
    const proyectos = await Promise.all(
        participacionesActivas.map(
            (p) => proyectoRepository.getById(p.proyectoId),
        ),
    );
    const perfiles = await Promise.all(
        participacionesActivas.map((p) =>
          p.perfilParticipacionId ?
            perfilParticipacionRepository.getById(p.perfilParticipacionId) :
            null,
        ),
    );
    // Mandante del Proyecto (no de la Participación) — se resuelve vía
    // proyectos[i].mandanteId, con una cache local para no repetir la
    // misma consulta si dos Proyectos activos comparten Mandante.
    const mandanteCache = {};
    const mandantes = await Promise.all(
        proyectos.map(async (proyecto) => {
          if (!proyecto?.mandanteId) return null;
          if (!(proyecto.mandanteId in mandanteCache)) {
            mandanteCache[proyecto.mandanteId] =
                await mandanteRepository.getById(proyecto.mandanteId);
          }
          return mandanteCache[proyecto.mandanteId];
        }),
    );
    // Personas/Maquinarias y avance de Requerimientos DE ESTA Participación
    // (su Proyecto y su Expediente), nunca agregados entre Proyectos.
    const resumenesParticipacion = await Promise.all(
        participacionesActivas.map(
            (p) => reporteService.resumirParticipacion(p),
        ),
    );
    const participacionesDetalle = participacionesActivas.map((p, i) => ({
      participacionId: p.id,
      personasCount: resumenesParticipacion[i].personasCount,
      recursosCount: resumenesParticipacion[i].recursosCount,
      evaluacion: resumenesParticipacion[i].evaluacion,
      proyectoId: p.proyectoId,
      proyectoNombre: proyectos[i]?.nombre || null,
      perfilParticipacionId: p.perfilParticipacionId || null,
      perfilNombre: perfiles[i]?.nombre || null,
      mandanteId: proyectos[i]?.mandanteId || null,
      mandanteNombre: getMandanteDisplayName(mandantes[i]) || null,
      mandanteLogoUrl: mandantes[i]?.logoUrl || null,
    }));

    return {
      personasCount: personas.length,
      recursosCount: recursos.length,
      proyectosCount: proyectosActivos.size,
      participacionesActivas: participacionesDetalle,
    };
  }

  /**
   * Eventos de Bitácora relacionados a una Empresa: los de la propia
   * Empresa, los de sus Participaciones y los de sus Asignaciones (cualquier
   * estado). Solo lectura, solo datos reales de Bitácora.
   * @param {string} id ID de la empresa.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {{limit: (string|number|undefined)}} [opciones] Máximo de
   *     eventos (por defecto 15, tope 500).
   * @return {Promise<Object[]>} Eventos, más reciente primero.
   */
  async obtenerEventos(id, actor, {limit} = {}) {
    await this.getEmpresaById(id); // Verifica existencia

    const [participaciones, asignaciones] = await Promise.all([
      participacionRepository.list({empresaId: id}),
      asignacionRepository.list({empresaId: id}),
    ]);

    // Una consulta por referencia: se acota a las Asignaciones más
    // recientes (el repositorio las devuelve de más nueva a más antigua)
    // para no disparar lecturas en Empresas con mucho personal.
    const MAX_ASIGNACIONES = 30;
    const referencias = [
      {entidad: "empresa", entidadId: id},
      ...participaciones.map((p) => ({
        entidad: "participacion", entidadId: p.id,
      })),
      ...asignaciones.slice(0, MAX_ASIGNACIONES).map((a) => ({
        entidad: "asignacion", entidadId: a.id,
      })),
    ];

    return bitacoraService.listarPorReferencias(referencias, actor, {limit});
  }
}

module.exports = new EmpresaService();
