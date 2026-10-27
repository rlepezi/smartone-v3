const {FieldValue} = require("firebase-admin/firestore");
const expedienteRepository = require("../repositories/expedienteRepository");
const evaluacionRepository = require("../repositories/evaluacionRepository");

/**
 * Motor de reutilización documental: dada una Persona, Recurso o Empresa
 * y un conjunto de Requerimientos aplicables, ubica qué Evaluaciones
 * previas siguen siendo válidas para darlas por cumplidas automáticamente
 * en un Expediente nuevo, sin evaluación manual. Extraído de
 * `acreditacionService.js` (Reemplazar Acreditación) para que
 * `expedienteService.js` (creación normal de Expediente) lo reutilice sin
 * duplicar la lógica — ambos flujos deben aplicar exactamente la misma
 * regla de vigencia.
 */
class ReutilizacionDocumentalService {
  /**
   * Convierte un Timestamp de Firestore, Date o string a milisegundos.
   * @param {*} valor Valor a convertir.
   * @return {number} Milisegundos desde epoch, o 0 si no es convertible.
   */
  aMillis(valor) {
    if (!valor) return 0;
    if (typeof valor.toMillis === "function") return valor.toMillis();
    if (valor instanceof Date) return valor.getTime();
    const parsed = new Date(valor);
    return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  /**
   * Regla de reutilización documental (estricta, confirmada con el
   * negocio): una Evaluación vigente con `resultado: "cumple"` es
   * reutilizable si no tiene `fechaVencimiento`, o si esta es posterior a
   * la `fechaInicio` de la nueva participación/asignación. Si vence antes,
   * no se reutiliza — el requerimiento queda "pendiente" y sigue el flujo
   * normal de vencimientos.
   * @param {*} fechaVencimiento Vencimiento de la Evaluación original.
   * @param {Date} fechaInicioNueva Fecha de inicio de la nueva
   *     participación/asignación.
   * @return {boolean} true si la Evaluación sigue siendo válida.
   */
  vencimientoValido(fechaVencimiento, fechaInicioNueva) {
    if (!fechaVencimiento) return true;
    return this.aMillis(fechaVencimiento) > fechaInicioNueva.getTime();
  }

  /**
   * De un conjunto de Evaluaciones (de cualquier Expediente/estado), se
   * queda con las reutilizables para los Requerimientos indicados: vigente
   * + `resultado: "cumple"` + regla de vencimiento, quedándose con la más
   * reciente (`createdAt`) cuando hay más de una para el mismo
   * Requerimiento.
   * @param {Object[]} evaluaciones Evaluaciones candidatas.
   * @param {Object[]} requerimientos Requerimientos aplicables (snapshot)
   *     a los que restringir la búsqueda.
   * @param {Date} fechaInicioNueva Fecha de inicio de la nueva
   *     participación/asignación.
   * @return {Object[]} Evaluaciones originales reutilizables, una por
   *     Requerimiento.
   */
  filtrarReutilizables(evaluaciones, requerimientos, fechaInicioNueva) {
    const idsAplicables = new Set(requerimientos.map((r) => r.requerimientoId));
    const porRequerimiento = {};
    evaluaciones.forEach((ev) => {
      if (ev.estado !== "vigente") return;
      if (ev.resultado !== "cumple") return;
      if (!idsAplicables.has(ev.requerimientoId)) return;
      if (!this.vencimientoValido(ev.fechaVencimiento, fechaInicioNueva)) {
        return;
      }

      const actual = porRequerimiento[ev.requerimientoId];
      if (
        !actual ||
        this.aMillis(ev.createdAt) > this.aMillis(actual.createdAt)
      ) {
        porRequerimiento[ev.requerimientoId] = ev;
      }
    });
    return Object.values(porRequerimiento);
  }

  /**
   * Busca Evaluaciones reutilizables de nivel "empresa" (personaId y
   * recursoId nulos). Evaluación no tiene `empresaId` propio, así que se
   * ubica primero el universo de Expedientes de la Empresa.
   * @param {string} empresaId ID de la Empresa.
   * @param {Object[]} requerimientosEmpresa Requerimientos de nivel
   *     "empresa" aplicables al nuevo Expediente.
   * @param {Date} fechaInicioNueva Fecha de inicio de la nueva
   *     participación.
   * @param {string} mandanteId Mandante del Expediente destino: solo se
   *     reutilizan Evaluaciones de ese Mandante.
   * @return {Promise<Object[]>} Evaluaciones originales reutilizables.
   */
  async buscarReutilizablesEmpresa(
      empresaId, requerimientosEmpresa, fechaInicioNueva, mandanteId,
  ) {
    if (requerimientosEmpresa.length === 0 || !mandanteId) return [];
    const expedientes = (await expedienteRepository.getByEmpresa(empresaId))
        .filter((e) => e.mandanteId === mandanteId);
    const expedienteIds = expedientes.map((e) => e.id);
    const evaluaciones =
        await evaluacionRepository.getByExpedientesIds(expedienteIds);
    const soloEmpresa = this._delMandante(evaluaciones, mandanteId).filter(
        (e) => !e.personaId && !e.recursoId,
    );
    return this.filtrarReutilizables(
        soloEmpresa, requerimientosEmpresa, fechaInicioNueva,
    );
  }

  /**
   * Deja solo las Evaluaciones del Mandante indicado: nunca se reutiliza
   * una Evaluación de otro Mandante (los Requerimientos son por Mandante;
   * este filtro lo garantiza aunque coincidiera el requerimientoId).
   * @param {Object[]} evaluaciones Evaluaciones candidatas.
   * @param {string} mandanteId Mandante del Expediente destino.
   * @return {Object[]} Evaluaciones de ese Mandante.
   */
  _delMandante(evaluaciones, mandanteId) {
    return evaluaciones.filter((e) => e.mandanteId === mandanteId);
  }

  /**
   * Busca Evaluaciones reutilizables de una Persona, en cualquier
   * Expediente/Proyecto anterior.
   * @param {string} personaId ID de la Persona.
   * @param {Object[]} requerimientos Requerimientos de nivel "persona"
   *     aplicables al Expediente destino.
   * @param {Date} fechaInicioNueva Fecha de inicio de la nueva asignación.
   * @param {string} mandanteId Mandante del Expediente destino.
   * @return {Promise<Object[]>} Evaluaciones originales reutilizables.
   */
  async buscarReutilizablesPersona(
      personaId, requerimientos, fechaInicioNueva, mandanteId,
  ) {
    if (requerimientos.length === 0 || !mandanteId) return [];
    const evaluaciones =
        await evaluacionRepository.getVigentesByPersona(personaId);
    return this.filtrarReutilizables(
        this._delMandante(evaluaciones, mandanteId), requerimientos,
        fechaInicioNueva,
    );
  }

  /**
   * Busca Evaluaciones reutilizables de un Recurso (maquinaria), en
   * cualquier Expediente/Proyecto anterior.
   * @param {string} recursoId ID del Recurso.
   * @param {Object[]} requerimientos Requerimientos de tipo "recurso"
   *     aplicables al Expediente destino.
   * @param {Date} fechaInicioNueva Fecha de inicio de la nueva asignación.
   * @param {string} mandanteId Mandante del Expediente destino.
   * @return {Promise<Object[]>} Evaluaciones originales reutilizables.
   */
  async buscarReutilizablesRecurso(
      recursoId, requerimientos, fechaInicioNueva, mandanteId,
  ) {
    if (requerimientos.length === 0 || !mandanteId) return [];
    const evaluaciones =
        await evaluacionRepository.getVigentesByRecurso(recursoId);
    return this.filtrarReutilizables(
        this._delMandante(evaluaciones, mandanteId), requerimientos,
        fechaInicioNueva,
    );
  }

  /**
   * Datos de una Evaluación "reutilizada": copia de la Evaluación original
   * (solo la evaluación, sin enlazar su evidencia) apuntando a la instancia
   * del nuevo Expediente. `modalidad: "reutilizada"` y
   * `evaluacionOrigenId` dejan la trazabilidad de que no se evaluó
   * manualmente esta vez. Quien la escribe (lote o transacción) actualiza
   * en la misma escritura la instancia y los contadores del Expediente.
   * @param {Object} original Evaluación original reutilizable.
   * @param {{expedienteId: string, expedienteRequerimientoId: string,
   *     mandanteId: ?string, actor: Object, creadoPorNombre: string}}
   *     contexto Instancia destino y actor.
   * @return {Object} Datos de la Evaluación a crear.
   */
  datosReutilizada(original, {
    expedienteId, expedienteRequerimientoId, mandanteId, actor,
    creadoPorNombre,
  }) {
    return {
      expedienteId,
      expedienteRequerimientoId,
      evaluacionOrigenId: original.id,
      requerimientoId: original.requerimientoId,
      empresaId: original.empresaId || null,
      mandanteId,
      personaId: original.personaId || null,
      recursoId: original.recursoId || null,
      fechaVencimiento: original.fechaVencimiento || null,
      resultado: "cumple",
      modalidad: "reutilizada",
      metodoVerificacion: original.metodoVerificacion || null,
      observaciones:
          `Reutilizada automáticamente desde la Evaluación ${original.id} ` +
          `(Expediente ${original.expedienteId}).`,
      evaluadorId: actor.uid,
      evaluadorNombre: creadoPorNombre,
      estado: "vigente",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
  }
}

module.exports = new ReutilizacionDocumentalService();
