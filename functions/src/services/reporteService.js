const expedienteService = require("./expedienteService");
const evaluacionService = require("./evaluacionService");
const evidenciaService = require("./evidenciaService");
const empresaRepository = require("../repositories/empresaRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const participacionRepository =
    require("../repositories/participacionRepository");
const asignacionRepository = require("../repositories/asignacionRepository");
const expedienteRepository = require("../repositories/expedienteRepository");
const evaluacionRepository = require("../repositories/evaluacionRepository");
const perfilParticipacionRepository =
    require("../repositories/perfilParticipacionRepository");
const proyectoService = require("./proyectoService");
const AppError = require("../utils/AppError");
const {
  aplicaRequerimientoASujeto, sujetoDeAsignacion,
} = require("../utils/aplicabilidadRequerimiento");
// TRANSICIÓN bloque 2: perfilRecursoId de cada Asignación.
const {resolverPerfilesRecurso} = require("../utils/transicionPerfilRecurso");

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

/**
 * Reglas de negocio para el módulo Reportes: cálculo on-demand del reporte
 * de cumplimiento (Doc 3, secciones 15.11/15.17), sin colección propia —
 * se calcula en vivo sobre Expediente/Evaluación/Evidencia/Empresa/
 * Proyecto ya existentes. 100% de lectura.
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
   * Calcula los conteos por resultado y el % de avance de un conjunto de
   * Evaluaciones vigentes. avancePct = cumplidos / evaluables * 100,
   * donde "evaluables" excluye "no_aplica" (Doc 3, sección 15.11).
   * @param {Object[]} vigentes Evaluaciones vigentes a resumir.
   * @param {{personaId: (string|undefined), recursoId: (string|undefined)}}
   *     [filtro] Si se indica `personaId` o `recursoId`, solo se cuentan
   *     las Evaluaciones de ese sujeto (mismo cálculo, acotado a una
   *     Persona/Maquinaria individual).
   * @return {{cumple: number, noCumple: number, pendiente: number,
   *     noAplica: number, avancePct: ?number}} El resumen calculado.
   *     avancePct es null cuando no hay evaluables (nada que evaluar
   *     todavía), nunca 0 por división por cero.
   */
  _calcularAvanceRequerimientos(vigentes, {personaId, recursoId} = {}) {
    const conteos = {cumple: 0, no_cumple: 0, pendiente: 0, no_aplica: 0};
    vigentes.forEach((ev) => {
      if (personaId && ev.personaId !== personaId) return;
      if (recursoId && ev.recursoId !== recursoId) return;
      if (conteos[ev.resultado] !== undefined) conteos[ev.resultado]++;
    });

    // evaluables === 0 no es "0% de cumplimiento" — es "nada que evaluar
    // todavía" (sin Requerimientos aplicables, o ninguno evaluado aún).
    // Se devuelve null, no 0, para que el frontend lo distinga de un
    // incumplimiento real.
    const evaluables = conteos.cumple + conteos.no_cumple + conteos.pendiente;
    const avancePct = evaluables > 0 ?
        Math.round((conteos.cumple / evaluables) * 100) : null;

    return {
      cumple: conteos.cumple,
      noCumple: conteos.no_cumple,
      pendiente: conteos.pendiente,
      noAplica: conteos.no_aplica,
      avancePct,
    };
  }

  /**
   * Agrupa un conjunto de Expedientes según MAPEO_ESTADO_KPI_EMPRESA.
   * `total` cuenta EXPEDIENTES (procesos de acreditación), no Empresas
   * distintas: una Empresa con más de un Expediente en alcance (posible
   * cuando no se filtra por Proyecto) cuenta una vez por cada uno. La
   * vista deduplicada por Empresa vive en `porEmpresa`.
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
   * Resuelve, respetando el alcance del actor, los tres conjuntos base
   * sobre los que se calcula todo el reporte: Expedientes en alcance
   * (opcionalmente acotados a un Proyecto), Evaluaciones vigentes de esos
   * Expedientes, y Evidencias de esos Expedientes. Reusa
   * expedienteService/evaluacionService/evidenciaService — nunca
   * reimplementa la resolución de scope por Mandante.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {?string} proyectoId ID de Proyecto para acotar, o null/
   *     undefined para no acotar.
   * @return {Promise<{expedientesEnAlcance: Object[],
   *     expedienteIds: Set<string>, vigentesEnAlcance: Object[],
   *     evidenciasEnAlcance: Object[]}>} Los conjuntos resueltos.
   */
  async _resolverAlcance(actor, proyectoId) {
    const todosExpedientes = await expedienteService.listarExpedientes(
        {}, actor,
    );
    const expedientesEnAlcance = proyectoId ?
        todosExpedientes.filter((e) => e.proyectoId === proyectoId) :
        todosExpedientes;
    const expedienteIds = new Set(expedientesEnAlcance.map((e) => e.id));

    const [todasVigentes, todasEvidencias] = await Promise.all([
      evaluacionService.listarVigentes(actor),
      evidenciaService.listarEvidencias({}, actor),
    ]);

    const vigentesEnAlcance = todasVigentes.filter(
        (ev) => expedienteIds.has(ev.expedienteId),
    );
    const evidenciasEnAlcance = todasEvidencias.filter(
        (ev) => expedienteIds.has(ev.expedienteId),
    );

    return {
      expedientesEnAlcance, expedienteIds, vigentesEnAlcance,
      evidenciasEnAlcance,
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
   * Genera el reporte de cumplimiento completo, en vivo, para el alcance
   * del actor (opcionalmente acotado a un Proyecto).
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {{proyectoId: (string|undefined),
   *     diasVencimiento: (number|undefined)}} opciones Opciones del
   *     reporte.
   * @return {Promise<Object>} El reporte calculado.
   */
  async generarReporte(actor, {proyectoId, diasVencimiento = 30} = {}) {
    const {
      expedientesEnAlcance, vigentesEnAlcance, evidenciasEnAlcance,
    } = await this._resolverAlcance(actor, proyectoId);

    const empresasKpi = this._categorizarEmpresas(expedientesEnAlcance);
    const requerimientos = this._calcularAvanceRequerimientos(
        vigentesEnAlcance,
    );

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const vencimientos = {vigente: 0, porVencer: 0, vencido: 0};
    // Une ambas fuentes de vencimiento (Evidencia + Evaluación) sin
    // deduplicar: son documentos distintos con semántica distinta (un
    // archivo que expira vs. un Requerimiento a re-verificar), así que
    // cada uno cuenta como un ítem independiente aunque coincida la
    // fecha.
    [
      ...evidenciasEnAlcance.filter(
          (ev) => ev.estado === "activo" && ev.fechaVencimiento,
      ),
      ...vigentesEnAlcance.filter((ev) => ev.fechaVencimiento),
    ].forEach((ev) => {
      const fecha = this._aFecha(ev.fechaVencimiento);
      if (!fecha) return;
      const dias = Math.ceil((fecha - hoy) / (1000 * 60 * 60 * 24));
      if (dias < 0) {
        vencimientos.vencido++;
      } else if (dias <= diasVencimiento) {
        vencimientos.porVencer++;
      } else {
        vencimientos.vigente++;
      }
    });

    // 6. Por Empresa (vista deduplicada — una fila por Empresa, a
    // diferencia de `empresasKpi` que cuenta procesos/Expedientes).
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
      const idsEmpresa = new Set(expedientesEmpresa.map((e) => e.id));
      const vigentesEmpresa = vigentesEnAlcance.filter(
          (ev) => idsEmpresa.has(ev.expedienteId),
      );
      const {avancePct, cumple, noCumple, pendiente, noAplica} =
          this._calcularAvanceRequerimientos(vigentesEmpresa);

      // Si la Empresa tiene más de un Expediente en alcance (posible sin
      // filtro de Proyecto), se muestra el estado del más reciente —
      // expedientesEnAlcance ya viene ordenado por createdAt desc desde
      // el repositorio.
      return {
        empresaId,
        empresaNombre: empresaPorExpediente[expedientesEmpresa[0].id]
            .empresaNombre,
        avancePct,
        // Cantidad de Requerimientos con Evaluación vigente registrada
        // (cualquier resultado) — para mostrar "X evaluados" sin obligar
        // al frontend a recalcularlo sobre la lista cruda.
        evaluados: cumple + noCumple + pendiente + noAplica,
        cumple,
        noCumple,
        pendiente,
        noAplica,
        expedienteEstado: expedientesEmpresa[0]?.estado || null,
      };
    });

    // 7. Por Proyecto — solo si no se filtró un Proyecto específico.
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
        const idsProyecto = new Set(expedientesProyecto.map((e) => e.id));
        const vigentesProyecto = vigentesEnAlcance.filter(
            (ev) => idsProyecto.has(ev.expedienteId),
        );
        const proyecto = proyectoMap[pid];

        return {
          proyectoId: pid,
          proyectoNombre: proyecto ?
              `${proyecto.nombre} (${proyecto.codigo})` : pid,
          empresas: this._categorizarEmpresas(expedientesProyecto),
          requerimientos: this._calcularAvanceRequerimientos(
              vigentesProyecto,
          ),
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

    const {
      expedientesEnAlcance, vigentesEnAlcance, evidenciasEnAlcance,
    } = await this._resolverAlcance(actor, proyectoId);

    if (tipo === "vencidos" || tipo === "por_vencer") {
      const empresaPorExpediente = await this._mapaEmpresaPorExpediente(
          expedientesEnAlcance,
      );

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      // Requerimientos únicos entre las evaluaciones con vencimiento, para
      // resolver su nombre y armar la etiqueta "Requerimiento: {nombre}"
      // (reusa el mismo campo `archivoNombre` que Evidencia, para no
      // tener que adaptar el modal de detalle en el frontend a una forma
      // distinta según la fuente).
      const evaluacionesConVencimiento = vigentesEnAlcance.filter(
          (ev) => ev.fechaVencimiento,
      );
      const requerimientoIds = [
        ...new Set(evaluacionesConVencimiento.map((ev) => ev.requerimientoId)),
      ];
      const requerimientosDocs = await Promise.all(
          requerimientoIds.map((rid) => requerimientoRepository.getById(rid)),
      );
      const requerimientoMap = {};
      requerimientosDocs.forEach((r) => {
        if (r) requerimientoMap[r.id] = r;
      });

      const itemsUnificados = [
        ...evidenciasEnAlcance
            .filter((ev) => ev.estado === "activo" && ev.fechaVencimiento)
            .map((ev) => ({
              id: ev.id,
              empresaNombre:
                  empresaPorExpediente[ev.expedienteId]?.empresaNombre ||
                  null,
              archivoNombre: ev.archivoNombre,
              archivoUrl: ev.archivoUrl,
              fechaVencimiento: ev.fechaVencimiento,
            })),
        ...evaluacionesConVencimiento.map((ev) => ({
          id: ev.id,
          empresaNombre:
              empresaPorExpediente[ev.expedienteId]?.empresaNombre || null,
          archivoNombre: `Requerimiento: ${
            requerimientoMap[ev.requerimientoId]?.nombre || ev.requerimientoId
          }`,
          archivoUrl: null,
          fechaVencimiento: ev.fechaVencimiento,
        })),
      ];

      return itemsUnificados
          .map((item) => {
            const fecha = this._aFecha(item.fechaVencimiento);
            const dias = fecha ?
                Math.ceil((fecha - hoy) / (1000 * 60 * 60 * 24)) : null;
            return {...item, diasRestantes: dias};
          })
          .filter((item) => {
            if (item.diasRestantes === null) return false;
            return tipo === "vencidos" ?
                item.diasRestantes < 0 :
                item.diasRestantes >= 0 &&
                    item.diasRestantes <= diasVencimiento;
          });
    }

    // "no_cumple" / "pendientes": basados en Evaluación, que sí trae
    // requerimientoId directo.
    const resultadoBuscado = tipo === "no_cumple" ? "no_cumple" : "pendiente";
    const filtradas = vigentesEnAlcance.filter(
        (ev) => ev.resultado === resultadoBuscado,
    );

    const expedientePorId = {};
    expedientesEnAlcance.forEach((exp) => {
      expedientePorId[exp.id] = exp;
    });
    const empresaPorExpediente = await this._mapaEmpresaPorExpediente(
        expedientesEnAlcance,
    );

    const requerimientoIds = [
      ...new Set(filtradas.map((ev) => ev.requerimientoId)),
    ];
    const requerimientosDocs = await Promise.all(
        requerimientoIds.map((id) => requerimientoRepository.getById(id)),
    );
    const requerimientoMap = {};
    requerimientosDocs.forEach((r) => {
      if (r) requerimientoMap[r.id] = r;
    });

    return filtradas.map((ev) => ({
      id: ev.id,
      empresaNombre:
          empresaPorExpediente[ev.expedienteId]?.empresaNombre || null,
      requerimientoNombre:
          requerimientoMap[ev.requerimientoId]?.nombre || ev.requerimientoId,
      resultado: ev.resultado,
      observaciones: ev.observaciones || null,
      expedienteId: ev.expedienteId,
      proyectoId: expedientePorId[ev.expedienteId]?.proyectoId || null,
      createdAt: ev.createdAt,
    }));
  }

  /**
   * Resuelve el Expediente de una Participación (si hubiera más de uno,
   * prevalece el que sigue abierto) y sus Evaluaciones vigentes.
   * @param {string} participacionId ID de la Participación.
   * @return {Promise<{expediente: ?Object, vigentes: Object[]}>} Ambos.
   */
  async _expedienteYVigentes(participacionId) {
    const expedientes =
        await expedienteRepository.getByParticipacion(participacionId);
    const expediente =
        expedientes.find((e) => e.estado !== "cerrado") ||
        expedientes[0] || null;
    const vigentes = expediente ?
        (await evaluacionRepository.getByExpediente(expediente.id))
            .filter((ev) => ev.estado === "vigente") :
        [];
    return {expediente, vigentes};
  }

  /**
   * Resume UNA Participación de una Empresa: cuántas Personas y
   * Maquinarias tiene asignadas en ese Proyecto y su avance de
   * Requerimientos (mismo cálculo que el resto del reporte, acotado al
   * Expediente de esa Participación — nunca agregado entre Proyectos).
   * @param {Object} participacion Participación (id, proyectoId,
   *     empresaId).
   * @return {Promise<{personasCount: number, recursosCount: number,
   *     evaluacion: {avancePct: ?number, evaluados: number,
   *     expedienteEstado: ?string}}>} El resumen.
   */
  async resumirParticipacion(participacion) {
    const [{expediente, vigentes}, asignaciones] = await Promise.all([
      this._expedienteYVigentes(participacion.id),
      asignacionRepository.getActivasByProyecto(participacion.proyectoId),
    ]);
    const propias = asignaciones.filter(
        (a) => a.empresaId === participacion.empresaId,
    );
    const distintos = (campo) =>
      new Set(propias.filter((a) => a[campo]).map((a) => a[campo])).size;
    const {avancePct, cumple, noCumple, pendiente, noAplica} =
        this._calcularAvanceRequerimientos(vigentes);

    return {
      personasCount: distintos("personaId"),
      recursosCount: distintos("recursoId"),
      evaluacion: {
        avancePct,
        evaluados: cumple + noCumple + pendiente + noAplica,
        expedienteEstado: expediente?.estado || null,
      },
    };
  }

  /**
   * Cuenta, entre las Asignaciones activas de una Empresa en un Proyecto,
   * cuántas Personas (o Maquinarias) están "acreditadas": todos sus
   * Requerimientos propios aplicables (según aplicaRequerimientoASujeto,
   * con el Perfil de Recurso de su Asignación) tienen Evaluación vigente en
   * `cumple` o `no_aplica`. Un Requerimiento sin Evaluación cuenta como
   * pendiente (mismo criterio que
   * expedienteService._validarEvaluacionesCompletas). Sin Expediente no
   * hay contra qué evaluar, así que nadie queda acreditado; con
   * Expediente pero sin Requerimientos propios aplicables, el sujeto
   * cuenta como acreditado (no tiene nada pendiente).
   * @param {Object[]} asignaciones Asignaciones activas de la Empresa.
   * @param {string} campoId "personaId" o "recursoId".
   * @param {?Object} expediente Expediente de la Participación, o null.
   * @param {Object[]} vigentes Evaluaciones vigentes de ese Expediente.
   * @return {{acreditadas: number, total: number}} El conteo.
   */
  _contarAcreditados(asignaciones, campoId, expediente, vigentes) {
    const aplicables = expediente?.requerimientosAplicables || [];

    const vistos = new Set();
    let acreditadas = 0;
    asignaciones.forEach((a) => {
      const sujetoId = a[campoId];
      if (!sujetoId || vistos.has(sujetoId)) return;
      vistos.add(sujetoId);
      if (!expediente) return;

      const propios = new Set(
          aplicables
              .filter((r) => aplicaRequerimientoASujeto(
                  r, sujetoDeAsignacion(a)))
              .map((r) => r.requerimientoId),
      );
      const vigentesPropias = vigentes.filter(
          (ev) => propios.has(ev.requerimientoId),
      );
      const avance = this._calcularAvanceRequerimientos(
          vigentesPropias, {[campoId]: sujetoId},
      );
      const resueltas = avance.cumple + avance.noAplica;
      if (
        avance.noCumple === 0 && avance.pendiente === 0 &&
        resueltas === propios.size
      ) {
        acreditadas++;
      }
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

    const [participaciones, asignacionesProyecto] = await Promise.all([
      participacionRepository.list({proyectoId, estado: "activa"}),
      asignacionRepository.getActivasByProyecto(proyectoId)
          .then(resolverPerfilesRecurso),
    ]);

    const filas = await Promise.all(participaciones.map(async (p) => {
      const [empresa, perfil, {expediente, vigentes}] = await Promise.all([
        empresaRepository.getById(p.empresaId),
        p.perfilParticipacionId ?
            perfilParticipacionRepository.getById(p.perfilParticipacionId) :
            null,
        this._expedienteYVigentes(p.id),
      ]);

      const asignacionesEmpresa = asignacionesProyecto.filter(
          (a) => a.empresaId === p.empresaId,
      );

      return {
        empresaId: p.empresaId,
        empresaNombre: empresa?.razonSocial || p.empresaId,
        rut: empresa?.rut || null,
        empresaLogoUrl: empresa?.logoUrl || null,
        perfilParticipacion: perfil?.nombre || null,
        cumplimientoPct:
            this._calcularAvanceRequerimientos(vigentes).avancePct,
        personas: this._contarAcreditados(
            asignacionesEmpresa, "personaId", expediente, vigentes,
        ),
        maquinarias: this._contarAcreditados(
            asignacionesEmpresa, "recursoId", expediente, vigentes,
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
