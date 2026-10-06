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
   * @return {Promise<Object[]>} Evaluaciones originales reutilizables.
   */
  async buscarReutilizablesEmpresa(
      empresaId, requerimientosEmpresa, fechaInicioNueva,
  ) {
    if (requerimientosEmpresa.length === 0) return [];
    const expedientes = await expedienteRepository.getByEmpresa(empresaId);
    const expedienteIds = expedientes.map((e) => e.id);
    const evaluaciones =
        await evaluacionRepository.getByExpedientesIds(expedienteIds);
    const soloEmpresa = evaluaciones.filter(
        (e) => !e.personaId && !e.recursoId,
    );
    return this.filtrarReutilizables(
        soloEmpresa, requerimientosEmpresa, fechaInicioNueva,
    );
  }

  /**
   * Busca Evaluaciones reutilizables de una Persona, en cualquier
   * Expediente/Proyecto anterior.
   * @param {string} personaId ID de la Persona.
   * @param {Object[]} requerimientos Requerimientos de nivel "persona"
   *     aplicables al Expediente destino.
   * @param {Date} fechaInicioNueva Fecha de inicio de la nueva asignación.
   * @return {Promise<Object[]>} Evaluaciones originales reutilizables.
   */
  async buscarReutilizablesPersona(
      personaId, requerimientos, fechaInicioNueva,
  ) {
    if (requerimientos.length === 0) return [];
    const evaluaciones =
        await evaluacionRepository.getVigentesByPersona(personaId);
    return this.filtrarReutilizables(
        evaluaciones, requerimientos, fechaInicioNueva,
    );
  }

  /**
   * Busca Evaluaciones reutilizables de un Recurso (maquinaria), en
   * cualquier Expediente/Proyecto anterior.
   * @param {string} recursoId ID del Recurso.
   * @param {Object[]} requerimientos Requerimientos de tipo "recurso"
   *     aplicables al Expediente destino.
   * @param {Date} fechaInicioNueva Fecha de inicio de la nueva asignación.
   * @return {Promise<Object[]>} Evaluaciones originales reutilizables.
   */
  async buscarReutilizablesRecurso(
      recursoId, requerimientos, fechaInicioNueva,
  ) {
    if (requerimientos.length === 0) return [];
    const evaluaciones =
        await evaluacionRepository.getVigentesByRecurso(recursoId);
    return this.filtrarReutilizables(
        evaluaciones, requerimientos, fechaInicioNueva,
    );
  }

  /**
   * Encola, dentro de una transacción ya abierta, la creación de una
   * Evaluación "reutilizada" por cada Evaluación original reutilizable,
   * apuntando al nuevo Expediente. `modalidad: "reutilizada"` es un valor
   * nuevo junto al ya existente `"manual"` (evaluacionService.js) — deja
   * trazabilidad de que no fue evaluada manualmente esta vez.
   * @param {FirebaseFirestore.Transaction} transaction Transacción activa.
   * @param {FirebaseFirestore.DocumentReference[]} refs Referencias
   *     pre-generadas, una por cada entrada de `reutilizables`.
   * @param {Object[]} reutilizables Evaluaciones originales a reutilizar.
   * @param {{expedienteId: string, mandanteId: ?string, actor: Object,
   *     creadoPorNombre: string}} contexto Datos del nuevo Expediente y
   *     del actor que ejecuta la operación.
   * @return {void}
   */
  registrarReutilizadas(transaction, refs, reutilizables, {
    expedienteId, mandanteId, actor, creadoPorNombre,
  }) {
    reutilizables.forEach((original, i) => {
      transaction.set(refs[i], {
        expedienteId,
        requerimientoId: original.requerimientoId,
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
      });
    });
  }
}

module.exports = new ReutilizacionDocumentalService();
