const metricaUsuarioDiariaRepository =
    require("../repositories/metricaUsuarioDiariaRepository");
const {fechaSantiago} = require("../utils/fechaSantiago");

/**
 * Un solo punto de escritura por métrica (ver Fase C del prompt): este
 * Service es el ÚNICO lugar que llama a
 * `metricaUsuarioDiariaRepository.incrementar*` — nunca se agregan
 * contadores sueltos en otros Services.
 */
class MetricaUsuarioService {
  /**
   * @param {string} usuarioId ID del usuario.
   * @param {?string} mandanteId ID del Mandante.
   * @return {Promise<void>}
   */
  async registrarAcceso(usuarioId, mandanteId) {
    await metricaUsuarioDiariaRepository.incrementarAcceso(
        usuarioId, mandanteId, fechaSantiago(),
    );
  }

  /**
   * @param {string} usuarioId ID del usuario.
   * @param {?string} mandanteId ID del Mandante.
   * @param {Date} fechaInicioSesion Fecha de INICIO de la sesión que se
   *     está cerrando — el tiempo se imputa al día en que empezó.
   * @param {number} segundos Segundos a sumar.
   * @return {Promise<void>}
   */
  async registrarTiempoConectado(
      usuarioId, mandanteId, fechaInicioSesion, segundos,
  ) {
    await metricaUsuarioDiariaRepository.incrementarTiempoConectado(
        usuarioId, mandanteId, fechaSantiago(fechaInicioSesion), segundos,
    );
  }

  /**
   * Alimentado desde el trigger `onCreate` de Bitácora.
   * @param {{usuarioId: string, mandanteId: ?string, fecha: Date}} evento
   */
  async registrarExpedienteCreado({usuarioId, mandanteId, fecha}) {
    await metricaUsuarioDiariaRepository.incrementarExpedienteCreado(
        usuarioId, mandanteId, fechaSantiago(fecha),
    );
  }

  /**
   * Alimentado desde el trigger `onCreate` de Bitácora.
   * @param {{usuarioId: string, mandanteId: ?string, fecha: Date,
   *     sujeto: {empresaId, personaId, recursoId}}} evento
   */
  async registrarEvaluacionRealizada({usuarioId, mandanteId, fecha, sujeto}) {
    await metricaUsuarioDiariaRepository.incrementarEvaluacionRealizada(
        usuarioId, mandanteId, fechaSantiago(fecha), sujeto,
    );
  }

  /**
   * Totales + serie diaria + promedio de duración de sesión para
   * `GET /usuarios/:id/metricas`.
   * @param {string} usuarioId ID del usuario.
   * @param {{desde: string, hasta: string}} rango Fechas YYYY-MM-DD
   *     (America/Santiago), ambas inclusive.
   * @return {Promise<object>} Ver forma exacta en el comentario de
   *     retorno.
   */
  async obtenerMetricas(usuarioId, {desde, hasta}) {
    const dias = await metricaUsuarioDiariaRepository.listarRango(
        usuarioId, desde, hasta,
    );

    const totales = dias.reduce((acc, d) => {
      acc.accesos += d.accesos || 0;
      acc.segundosConectado += d.segundosConectado || 0;
      acc.expedientesCreados += d.expedientesCreados || 0;
      acc.evaluacionesRealizadas += d.evaluacionesRealizadas || 0;
      (d.empresasEvaluadas || [])
          .forEach((id) => acc.empresasEvaluadas.add(id));
      (d.personasEvaluadas || [])
          .forEach((id) => acc.personasEvaluadas.add(id));
      (d.maquinasEvaluadas || [])
          .forEach((id) => acc.maquinasEvaluadas.add(id));
      return acc;
    }, {
      accesos: 0, segundosConectado: 0, expedientesCreados: 0,
      evaluacionesRealizadas: 0,
      empresasEvaluadas: new Set(), personasEvaluadas: new Set(),
      maquinasEvaluadas: new Set(),
    });

    // Un "acceso" ES una sesión nueva (definición de Fase B) — el
    // promedio de duración de sesión sale de dividir el tiempo total
    // conectado entre la cantidad de accesos del mismo período, sin
    // consultar `sesiones` aparte (una sola fuente para ambos números).
    const promedioDuracionSesionSeg = totales.accesos > 0 ?
        Math.round(totales.segundosConectado / totales.accesos) : null;

    const serieDiaria = dias.map((d) => ({
      fecha: d.fecha,
      accesos: d.accesos || 0,
      minutosConectado: Math.round((d.segundosConectado || 0) / 60),
    }));

    return {
      totales: {
        accesos: totales.accesos,
        segundosConectado: totales.segundosConectado,
        expedientesCreados: totales.expedientesCreados,
        evaluacionesRealizadas: totales.evaluacionesRealizadas,
        empresasEvaluadas: totales.empresasEvaluadas.size,
        personasEvaluadas: totales.personasEvaluadas.size,
        maquinasEvaluadas: totales.maquinasEvaluadas.size,
      },
      serieDiaria,
      promedioDuracionSesionSeg,
    };
  }

  /**
   * `accesos7d`/`ultimoAcceso` para cada fila de `GET /usuarios` — UNA
   * consulta por lote de hasta 30 usuarios (`in`), nunca una por fila.
   * `ultimoAcceso` no sale de acá (ver `usuario.ultimoAccesoAt`,
   * denormalizado por `sesionService.iniciar`); esto solo resuelve
   * `accesos7d`.
   * @param {string[]} usuarioIds IDs de los usuarios listados.
   * @return {Promise<Object<string, number>>} Mapa usuarioId -> accesos
   *     de los últimos 7 días.
   */
  async obtenerAccesos7dPorUsuario(usuarioIds) {
    if (usuarioIds.length === 0) return {};
    const hasta = fechaSantiago();
    const desde = fechaSantiago(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const dias = await metricaUsuarioDiariaRepository.listarRangoTodos(
        usuarioIds, desde, hasta,
    );
    const mapa = {};
    dias.forEach((d) => {
      mapa[d.usuarioId] = (mapa[d.usuarioId] || 0) + (d.accesos || 0);
    });
    return mapa;
  }

  /**
   * Único punto de entrada del trigger `onCreate` de Bitácora (Fase C:
   * "Expedientes y evaluaciones: trigger onCreate del log de auditoría.
   * Hace increment en contadores y arrayUnion en los ids"). Ignora
   * cualquier entidad/acción que no sea una de las dos que alimentan
   * métricas de usuario — el resto de la Bitácora no le concierne a este
   * Service.
   * @param {object} registro El documento de Bitácora recién creado
   *     (`{entidad, accion, actorUid, mandanteId, detalle, createdAt}`).
   * @return {Promise<void>}
   */
  async procesarEventoBitacora(registro) {
    const {
      entidad, accion, actorUid, mandanteId, detalle, createdAt,
    } = registro;
    if (!actorUid) return;
    const fecha = createdAt?.toDate ? createdAt.toDate() : new Date();

    if (entidad === "expediente" && accion === "creado") {
      await this.registrarExpedienteCreado(
          {usuarioId: actorUid, mandanteId, fecha},
      );
      return;
    }

    if (entidad === "evaluacion" && accion === "creado") {
      const sujeto = await this._resolverSujetoEvaluacion(detalle);
      await this.registrarEvaluacionRealizada({
        usuarioId: actorUid, mandanteId, fecha, sujeto,
      });
    }
  }

  /**
   * El `detalle` de un evento `evaluacion/creado` trae `personaId`/
   * `recursoId` directo; si ambos son null, es de nivel EMPRESA y hay que
   * resolver `empresaId` desde el Expediente (única lectura extra, por
   * evento — no hay otra forma: la Bitácora de Evaluación no denormaliza
   * `empresaId`).
   * @param {{personaId: ?string, recursoId: ?string, expedienteId:
   *     string}} detalle
   * @return {Promise<{empresaId: (string|undefined), personaId:
   *     (string|undefined), recursoId: (string|undefined)}>}
   */
  async _resolverSujetoEvaluacion(detalle) {
    if (detalle?.personaId) return {personaId: detalle.personaId};
    if (detalle?.recursoId) return {recursoId: detalle.recursoId};
    const expedienteRepository =
        require("../repositories/expedienteRepository");
    const expediente =
        await expedienteRepository.getById(detalle?.expedienteId);
    return {empresaId: expediente?.empresaId};
  }

  /**
   * "Usuarios conectados ahora" para el panel "Actividad hoy" del
   * listado: sesiones con latido reciente. SÍ consulta `sesiones`
   * directo (a diferencia de `GET /usuarios`) porque acá es una sola
   * consulta agregada para toda la pantalla, no una por fila.
   * @param {number} minutos Umbral de latido reciente (el prompt pide
   *     <10 min).
   * @return {Promise<number>} Cantidad de sesiones activas ahora mismo.
   */
  async contarConectadosAhora(minutos = 10) {
    const sesionRepository = require("../repositories/sesionRepository");
    const corte = new Date(Date.now() - minutos * 60 * 1000);
    return sesionRepository.contarActivasDesde(corte);
  }

  /**
   * Panel "Actividad hoy" del listado de Usuarios (Fase E): usuarios
   * conectados ahora, accesos de hoy y tiempo promedio de sesión de hoy.
   * @param {?string} mandanteId Acota a un Mandante (mandante_admin), o
   *     null para ver todos (superadmin/admin_comercial).
   * @return {Promise<{activosHoy: number, conectadosAhora: number,
   *     promedioDuracionSesionSeg: ?number}>}
   */
  async obtenerResumenHoy(mandanteId) {
    const hoy = fechaSantiago();
    const dias = await metricaUsuarioDiariaRepository.listarDeHoy(
        hoy, mandanteId,
    );
    const activosHoy = dias.filter((d) => (d.accesos || 0) > 0).length;
    const totalAccesos = dias.reduce((s, d) => s + (d.accesos || 0), 0);
    const totalSegundos = dias.reduce(
        (s, d) => s + (d.segundosConectado || 0), 0,
    );
    const conectadosAhora = await this.contarConectadosAhora(10);
    return {
      activosHoy,
      conectadosAhora,
      promedioDuracionSesionSeg: totalAccesos > 0 ?
          Math.round(totalSegundos / totalAccesos) : null,
    };
  }
}

module.exports = new MetricaUsuarioService();
