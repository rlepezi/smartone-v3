const expedienteService = require("./expedienteService");
const evidenciaService = require("./evidenciaService");
const empresaRepository = require("../repositories/empresaRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const participacionRepository =
    require("../repositories/participacionRepository");
const expedienteRepository = require("../repositories/expedienteRepository");
const evaluacionRepository = require("../repositories/evaluacionRepository");
const expedienteRequerimientoRepository =
    require("../repositories/expedienteRequerimientoRepository");
const perfilParticipacionRepository =
    require("../repositories/perfilParticipacionRepository");
const proyectoService = require("./proyectoService");
const AppError = require("../utils/AppError");
const {
  sujetosActivosDeProyecto, sujetosActivosDeParticipacion,
} = require("../utils/sujetosParticipacion");
const {
  porcentajeCumplimiento, sumarResumenes, claveSujeto,
} = require("../utils/cumplimiento");

// Mapeo de estado de Expediente -> categoría del KPI de Empresas. Decisión
// de diseño deliberada, no cambiar sin revisar el resto del reporte:
//   - acreditadas: el Expediente ya alcanzó un estado operativo/aprobado.
//   - enProceso: el Expediente sigue en preparación/revisión/corrección.
//   - observadas: el Expediente tiene observaciones pendientes de corregir.
// "rechazadas" NO existe: la máquina de estados de Expediente no tiene un
// estado terminal de rechazo — brecha conocida y aceptada para este
// reporte, no se simula acá.
const MAPEO_ESTADO_KPI_EMPRESA = {
  aprobado: "acreditadas",
  en_ejecucion: "acreditadas",
  cerrado: "acreditadas",
  creado: "enProceso",
  en_revision: "enProceso",
  con_observaciones: "observadas",
};

const TIPOS_DETALLE_VALIDOS = [
  "vencidos", "por_vencer", "no_cumple", "pendientes",
];

// Roles con alcance forzado a su Mandante.
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Reglas de negocio para el módulo Reportes: cálculo on-demand del reporte
 * de cumplimiento (Doc 3, secciones 15.11/15.17), sin colección propia. Los
 * conteos y el % salen de los contadores de cada Expediente (`resumen`,
 * mantenidos junto con cada evaluación); los detalles y vencimientos, de
 * las instancias de Requerimiento (expedienteRequerimientos). 100% lectura.
 */
class ReporteService {
  /**
   * Convierte un valor (Firestore Timestamp, Date o string) a un objeto
   * Date de JavaScript.
   * @param {*} valor Valor a convertir.
   * @return {?Date} Fecha convertida, o null si el valor es nulo.
   */
  _aFecha(valor) {
    if (!valor) return null;
    if (typeof valor.toDate === "function") return valor.toDate();
    return new Date(valor);
  }

  /**
   * Conteos y % de cumplimiento de un conjunto de Expedientes, desde sus
   * contadores: % = cumple / (activas − noAplica); las instancias activas
   * sin evaluar cuentan como pendientes. null si no hay nada evaluable.
   * @param {Object[]} expedientes Expedientes (con `resumen`).
   * @return {{cumple: number, noCumple: number, pendiente: number,
   *     noAplica: number, activas: number, avancePct: ?number}} Resumen.
   */
  _avance(expedientes) {
    const total = sumarResumenes(expedientes.map((e) => e.resumen));
    return {
      cumple: total.cumple,
      noCumple: total.noCumple,
      pendiente: total.pendiente,
      noAplica: total.noAplica,
      activas: total.activas,
      avancePct: porcentajeCumplimiento(total),
    };
  }

  /**
   * Agrupa un conjunto de Expedientes según MAPEO_ESTADO_KPI_EMPRESA.
   * `total` cuenta EXPEDIENTES (procesos de acreditación), no Empresas
   * distintas. La vista deduplicada por Empresa vive en `porEmpresa`.
   * @param {Object[]} expedientes Expedientes a categorizar.
   * @return {{total: number, acreditadas: number, enProceso: number,
   *     observadas: number}} El resumen calculado.
   */
  _categorizarEmpresas(expedientes) {
    const conteo = {acreditadas: 0, enProceso: 0, observadas: 0};
    expedientes.forEach((e) => {
      const categoria = MAPEO_ESTADO_KPI_EMPRESA[e.estado];
      if (categoria) conteo[categoria]++;
    });
    return {total: expedientes.length, ...conteo};
  }

  /**
   * Expedientes en alcance del actor (opcionalmente de un Proyecto).
   * @param {Object} actor Usuario autenticado.
   * @param {?string} proyectoId Proyecto para acotar.
   * @return {Promise<{expedientesEnAlcance: Object[],
   *     expedienteIds: Set<string>}>} Expedientes e IDs.
   */
  async _resolverAlcance(actor, proyectoId) {
    const todos = await expedienteService.listarExpedientes({}, actor);
    const expedientesEnAlcance = proyectoId ?
        todos.filter((e) => e.proyectoId === proyectoId) : todos;
    return {
      expedientesEnAlcance,
      expedienteIds: new Set(expedientesEnAlcance.map((e) => e.id)),
    };
  }

  /**
   * mandanteId con el que acotar consultas de instancias.
   * @param {Object} actor Usuario autenticado.
   * @return {(string|undefined)} Mandante o undefined (sin acotar).
   */
  _mandanteDe(actor) {
    return ROLES_ALCANCE_FORZADO.includes(actor.rol) ?
        actor.mandanteId : undefined;
  }

  /**
   * Fuentes de vencimiento en alcance: Evidencias activas con fecha e
   * instancias activas con fecha de vencimiento (copiada de su evaluación
   * vigente).
   * @param {Object} actor Usuario autenticado.
   * @param {Set<string>} expedienteIds Expedientes en alcance.
   * @return {Promise<{evidencias: Object[], instancias: Object[]}>} Ambas.
   */
  async _conVencimiento(actor, expedienteIds) {
    const [evidencias, instancias] = await Promise.all([
      evidenciaService.listarEvidencias({}, actor),
      expedienteRequerimientoRepository.listConVencimiento(
          {mandanteId: this._mandanteDe(actor)},
      ),
    ]);
    return {
      evidencias: evidencias.filter((ev) =>
        expedienteIds.has(ev.expedienteId) && ev.estado === "activo" &&
          ev.fechaVencimiento),
      instancias: instancias.filter((i) => expedienteIds.has(i.expedienteId)),
    };
  }

  /**
   * Construye un mapa expedienteId -> {empresaId, empresaNombre} para los
   * Expedientes dados, resolviendo cada Empresa una sola vez.
   * @param {Object[]} expedientes Expedientes cuyas Empresas resolver.
   * @return {Promise<Object<string, {empresaId: string,
   *     empresaNombre: string}>>} El mapa resuelto.
   */
  async _mapaEmpresaPorExpediente(expedientes) {
    const empresaIds = [...new Set(expedientes.map((e) => e.empresaId))];
    const empresasDocs = await Promise.all(
        empresaIds.map((id) => empresaRepository.getById(id)),
    );
    const empresaMap = {};
    empresasDocs.forEach((e) => {
      if (e) empresaMap[e.id] = e;
    });

    const resultado = {};
    expedientes.forEach((exp) => {
      resultado[exp.id] = {
        empresaId: exp.empresaId,
        empresaNombre: empresaMap[exp.empresaId]?.razonSocial || exp.empresaId,
      };
    });
    return resultado;
  }

  /**
   * Días que faltan hasta una fecha (negativo si ya pasó).
   * @param {*} valor Fecha.
   * @param {Date} hoy Hoy a las 00:00.
   * @return {?number} Días o null.
   */
  _diasHasta(valor, hoy) {
    const fecha = this._aFecha(valor);
    if (!fecha) return null;
    return Math.ceil((fecha - hoy) / (1000 * 60 * 60 * 24));
  }

  /**
   * Genera el reporte de cumplimiento completo, en vivo, para el alcance
   * del actor (opcionalmente acotado a un Proyecto).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {{proyectoId: (string|undefined),
   *     diasVencimiento: (number|undefined)}} opciones Opciones del
   *     reporte.
   * @return {Promise<Object>} El reporte calculado.
   */
  async generarReporte(actor, {proyectoId, diasVencimiento = 30} = {}) {
    const {expedientesEnAlcance, expedienteIds} =
        await this._resolverAlcance(actor, proyectoId);

    const empresasKpi = this._categorizarEmpresas(expedientesEnAlcance);
    const requerimientos = this._avance(expedientesEnAlcance);

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const vencimientos = {vigente: 0, porVencer: 0, vencido: 0};
    // Evidencia (un archivo que expira) e instancia (un Requerimiento a
    // re-verificar) cuentan por separado aunque coincida la fecha.
    const {evidencias, instancias} =
        await this._conVencimiento(actor, expedienteIds);
    [...evidencias, ...instancias].forEach((item) => {
      const dias = this._diasHasta(item.fechaVencimiento, hoy);
      if (dias === null) return;
      if (dias < 0) vencimientos.vencido++;
      else if (dias <= diasVencimiento) vencimientos.porVencer++;
      else vencimientos.vigente++;
    });

    // Por Empresa (vista deduplicada — una fila por Empresa).
    const empresaPorExpediente = await this._mapaEmpresaPorExpediente(
        expedientesEnAlcance,
    );
    const empresaIds = [
      ...new Set(expedientesEnAlcance.map((e) => e.empresaId)),
    ];
    const porEmpresa = empresaIds.map((empresaId) => {
      const expedientesEmpresa = expedientesEnAlcance.filter(
          (e) => e.empresaId === empresaId,
      );
      const avance = this._avance(expedientesEmpresa);
      // Con más de un Expediente (posible sin filtro de Proyecto) se
      // muestra el estado del más reciente (vienen por createdAt desc).
      return {
        empresaId,
        empresaNombre: empresaPorExpediente[expedientesEmpresa[0].id]
            .empresaNombre,
        avancePct: avance.avancePct,
        // Instancias ya evaluadas (cumple / no cumple / no aplica).
        evaluados: avance.cumple + avance.noCumple + avance.noAplica,
        cumple: avance.cumple,
        noCumple: avance.noCumple,
        pendiente: avance.pendiente,
        noAplica: avance.noAplica,
        expedienteEstado: expedientesEmpresa[0]?.estado || null,
      };
    });

    // Por Proyecto — solo si no se filtró un Proyecto específico.
    let porProyecto = null;
    if (!proyectoId) {
      const proyectoIds = [
        ...new Set(expedientesEnAlcance.map((e) => e.proyectoId)),
      ];
      const proyectosDocs = await Promise.all(
          proyectoIds.map((id) => proyectoRepository.getById(id)),
      );
      const proyectoMap = {};
      proyectosDocs.forEach((p) => {
        if (p) proyectoMap[p.id] = p;
      });
      porProyecto = proyectoIds.map((pid) => {
        const expedientesProyecto = expedientesEnAlcance.filter(
            (e) => e.proyectoId === pid,
        );
        const proyecto = proyectoMap[pid];
        return {
          proyectoId: pid,
          proyectoNombre: proyecto ?
              `${proyecto.nombre} (${proyecto.codigo})` : pid,
          empresas: this._categorizarEmpresas(expedientesProyecto),
          requerimientos: this._avance(expedientesProyecto),
        };
      });
    }

    return {
      empresas: empresasKpi,
      requerimientos,
      vencimientos,
      porEmpresa,
      porProyecto,
    };
  }

  /**
   * Obtiene el detalle operacional que explica uno de los números del
   * resumen (Doc 3, sección 15.17).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {{tipo: string, proyectoId: (string|undefined),
   *     diasVencimiento: (number|undefined)}} opciones Opciones de la
   *     consulta.
   * @return {Promise<Object[]>} La lista de detalle.
   */
  async obtenerDetalle(actor, {tipo, proyectoId, diasVencimiento = 30}) {
    if (!TIPOS_DETALLE_VALIDOS.includes(tipo)) {
      throw new AppError(
          400,
          `Tipo de detalle '${tipo}' no válido. Valores permitidos: ` +
          `${TIPOS_DETALLE_VALIDOS.join(", ")}.`,
      );
    }

    const {expedientesEnAlcance, expedienteIds} =
        await this._resolverAlcance(actor, proyectoId);
    const empresaPorExpediente = await this._mapaEmpresaPorExpediente(
        expedientesEnAlcance,
    );

    if (tipo === "vencidos" || tipo === "por_vencer") {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const {evidencias, instancias} =
          await this._conVencimiento(actor, expedienteIds);
      // Mismo campo `archivoNombre` para ambas fuentes ("Requerimiento:
      // {nombre}" en las instancias), para no adaptar el modal de detalle.
      const items = [
        ...evidencias.map((ev) => ({
          id: ev.id,
          empresaNombre:
              empresaPorExpediente[ev.expedienteId]?.empresaNombre || null,
          archivoNombre: ev.archivoNombre,
          archivoUrl: ev.archivoUrl,
          fechaVencimiento: ev.fechaVencimiento,
        })),
        ...instancias.map((i) => ({
          id: i.id,
          empresaNombre:
              empresaPorExpediente[i.expedienteId]?.empresaNombre || null,
          archivoNombre: `Requerimiento: ${i.nombre}`,
          archivoUrl: null,
          fechaVencimiento: i.fechaVencimiento,
        })),
      ];
      return items
          .map((item) => ({
            ...item, diasRestantes: this._diasHasta(item.fechaVencimiento, hoy),
          }))
          .filter((item) => {
            if (item.diasRestantes === null) return false;
            return tipo === "vencidos" ?
                item.diasRestantes < 0 :
                item.diasRestantes >= 0 &&
                    item.diasRestantes <= diasVencimiento;
          });
    }

    // "no_cumple" / "pendientes": instancias activas con ese resultado
    // ("pendientes" incluye las aún sin evaluar).
    const resultadoBuscado = tipo === "no_cumple" ? "no_cumple" : "pendiente";
    const instancias = (await expedienteRequerimientoRepository.listByResultado(
        {mandanteId: this._mandanteDe(actor), resultado: resultadoBuscado},
    )).filter((i) => expedienteIds.has(i.expedienteId));
    const evaluaciones = await Promise.all(instancias.map((i) =>
      i.evaluacionVigenteId ?
        evaluacionRepository.getById(i.evaluacionVigenteId) : null,
    ));
    const expedientePorId = {};
    expedientesEnAlcance.forEach((exp) => {
      expedientePorId[exp.id] = exp;
    });
    return instancias.map((i, idx) => ({
      id: i.id,
      empresaNombre:
          empresaPorExpediente[i.expedienteId]?.empresaNombre || null,
      requerimientoNombre: i.nombre,
      resultado: i.resultado,
      observaciones: evaluaciones[idx]?.observaciones || null,
      expedienteId: i.expedienteId,
      proyectoId: expedientePorId[i.expedienteId]?.proyectoId || null,
      createdAt: evaluaciones[idx]?.createdAt || i.createdAt,
    }));
  }

  /**
   * Expediente de una Participación (si hay más de uno, prevalece el
   * abierto).
   * @param {string} participacionId ID de la Participación.
   * @return {Promise<?Object>} Expediente o null.
   */
  async _expedienteDe(participacionId) {
    const expedientes =
        await expedienteRepository.getByParticipacion(participacionId);
    return expedientes.find((e) => e.estado !== "cerrado") ||
        expedientes[0] || null;
  }

  /**
   * Resume UNA Participación de una Empresa: cuántas Personas y
   * Maquinarias tiene asignadas en ese Proyecto y su avance (contadores de
   * su Expediente — nunca agregado entre Proyectos).
   * @param {Object} participacion Participación (id, proyectoId,
   *     empresaId).
   * @return {Promise<{personasCount: number, recursosCount: number,
   *     evaluacion: {avancePct: ?number, evaluados: number,
   *     expedienteEstado: ?string}}>} El resumen.
   */
  async resumirParticipacion(participacion) {
    const [expediente, propias] = await Promise.all([
      this._expedienteDe(participacion.id),
      sujetosActivosDeParticipacion(participacion.id),
    ]);
    const distintos = (campo) =>
      new Set(propias.filter((a) => a[campo]).map((a) => a[campo])).size;
    const avance = this._avance(expediente ? [expediente] : []);

    return {
      personasCount: distintos("personaId"),
      recursosCount: distintos("recursoId"),
      evaluacion: {
        avancePct: avance.avancePct,
        evaluados: avance.cumple + avance.noCumple + avance.noAplica,
        expedienteEstado: expediente?.estado || null,
      },
    };
  }

  /**
   * Cuenta, entre los sujetos activos de una Empresa en un Proyecto,
   * cuántas Personas (o Maquinarias) están "acreditadas": todas sus
   * instancias activas resueltas en cumple / no_aplica (contadores por
   * sujeto del Expediente). Sin Expediente nadie queda acreditado; con
   * Expediente pero sin instancias propias, el sujeto no tiene nada
   * pendiente y cuenta como acreditado.
   * @param {Object[]} sujetos Sujetos activos de la Empresa.
   * @param {string} campoId "personaId" o "recursoId".
   * @param {?Object} expediente Expediente de la Participación, o null.
   * @return {{acreditadas: number, total: number}} El conteo.
   */
  _contarAcreditados(sujetos, campoId, expediente) {
    const vistos = new Set();
    let acreditadas = 0;
    sujetos.forEach((a) => {
      const sujetoId = a[campoId];
      if (!sujetoId || vistos.has(sujetoId)) return;
      vistos.add(sujetoId);
      if (!expediente) return;
      const r = expediente.resumenSujetos?.[claveSujeto(a)];
      if (!r || (!r.noCumple && !r.pendiente)) acreditadas++;
    });
    return {acreditadas, total: vistos.size};
  }

  /**
   * Lista las Empresas con Participación activa en un Proyecto, con su
   * perfil de participación, % de cumplimiento y cuántas de sus Personas
   * y Maquinarias asignadas están acreditadas. 100% de lectura.
   * @param {string} proyectoId ID del Proyecto.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object[]>} Una fila por Empresa, ordenada por nombre.
   */
  async obtenerParticipantesPorProyecto(proyectoId, actor) {
    // Valida existencia y alcance por Mandante del actor (404 si el
    // Proyecto no es visible para él), igual que el resto del módulo.
    await proyectoService.getProyectoById(proyectoId, actor);

    const [participaciones, sujetosProyecto] = await Promise.all([
      participacionRepository.list({proyectoId, estado: "activa"}),
      sujetosActivosDeProyecto(proyectoId),
    ]);

    const filas = await Promise.all(participaciones.map(async (p) => {
      const [empresa, perfil, expediente] = await Promise.all([
        empresaRepository.getById(p.empresaId),
        p.perfilParticipacionId ?
            perfilParticipacionRepository.getById(p.perfilParticipacionId) :
            null,
        this._expedienteDe(p.id),
      ]);
      const sujetosEmpresa = sujetosProyecto.filter(
          (a) => a.participacionId === p.id,
      );
      return {
        empresaId: p.empresaId,
        empresaNombre: empresa?.razonSocial || p.empresaId,
        rut: empresa?.rut || null,
        empresaLogoUrl: empresa?.logoUrl || null,
        perfilParticipacion: perfil?.nombre || null,
        cumplimientoPct: porcentajeCumplimiento(expediente?.resumen),
        personas: this._contarAcreditados(
            sujetosEmpresa, "personaId", expediente,
        ),
        maquinarias: this._contarAcreditados(
            sujetosEmpresa, "recursoId", expediente,
        ),
        estado: p.estado,
      };
    }));

    return filas.sort(
        (a, b) => a.empresaNombre.localeCompare(b.empresaNombre),
    );
  }
}

module.exports = new ReporteService();
