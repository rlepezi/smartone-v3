const resultadoRevisionRepository =
    require("../repositories/resultadoRevisionRepository");
const procesamientoIARepository =
    require("../repositories/procesamientoIARepository");
const tipoDocumentalRepository =
    require("../repositories/tipoDocumentalRepository");
const expedienteRequerimientoRepository =
    require("../repositories/expedienteRequerimientoRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const evidenciaRepository = require("../repositories/evidenciaRepository");
const evidenciaService = require("./evidenciaService");
const evidenciaRequerimientoService =
    require("./evidenciaRequerimientoService");
const evaluacionService = require("./evaluacionService");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");

const ACCIONES = ["aceptar", "corregir", "descartar"];
const RESULTADOS_FINALES = ["cumple", "no_cumple"];
const ESTADO_POR_ACCION = {
  aceptar: "aceptado", corregir: "corregido", descartar: "descartado",
};

/**
 * Fecha de vencimiento del documento consolidado (AAAA-MM-DD).
 * @param {Object} resultado Resultado de revisión.
 * @return {?string} Fecha o null.
 */
function fechaVencimientoDe(resultado) {
  const d = resultado.datosConsolidados || {};
  return resultado.tipoDocumentalCodigo === "CEDULA_CL" ?
    d.cedula?.fechaVencimiento || null :
    d.licencia?.fechaProximoControl || null;
}

/**
 * Resolución de un resultado de Revisión IA por un evaluador: aceptar la
 * propuesta, corregirla o descartarla. Aceptar y corregir crean, por cada
 * enlace requerido, las Evidencias (sin archivo, origen carpeta_local), sus
 * vínculos y la Evaluación "ia_asistida" con el flujo normal de
 * evaluaciones (la anterior pasa a "reemplazada" y se ajustan los
 * contadores del Expediente).
 */
class ResolucionService {
  /**
   * Crea Evidencias, vínculos y la Evaluación de un enlace.
   * @param {Object} entrada Datos.
   * @return {Promise<string>} ID de la Evaluación creada.
   */
  async _evaluarEnlace({resultado, enlace, piezas, resultadoFinal,
    observacion, actor, automatica = false, fechaVencimientoManual = null}) {
    const instancia = await expedienteRequerimientoRepository.getById(
        enlace.expedienteRequerimientoId,
    );
    if (!instancia || instancia.estado !== "activo") {
      throw new AppError(409, "El requerimiento del expediente ya no está " +
          "activo.");
    }
    // Al corregir, el evaluador puede indicar la fecha si la IA no la leyó
    // (o la leyó mal).
    const fechaVencimiento = fechaVencimientoManual ||
        fechaVencimientoDe(resultado);

    const evidenciaIds = [];
    try {
      return await this._crearEvidenciasYEvaluacion({resultado, enlace,
        piezas, resultadoFinal, observacion, actor, instancia,
        fechaVencimiento, evidenciaIds, automatica});
    } catch (error) {
      // Sin evaluación, las Evidencias recién creadas no deben quedar
      // respaldando la instancia.
      await Promise.all(evidenciaIds.map((id) => evidenciaRepository
          .update(id, {estado: "inactivo"}).catch(() => null)));
      throw error;
    }
  }

  /**
   * Crea las Evidencias de las piezas, sus vínculos y la Evaluación.
   * @param {Object} entrada Datos (evidenciaIds se va llenando).
   * @return {Promise<string>} ID de la Evaluación.
   */
  async _crearEvidenciasYEvaluacion({resultado, enlace, piezas,
    resultadoFinal, observacion, actor, instancia, fechaVencimiento,
    evidenciaIds, automatica}) {
    for (const pieza of piezas) {
      // eslint-disable-next-line no-await-in-loop
      const evidencia = await evidenciaService.crearEvidencia({
        expedienteId: enlace.expedienteId,
        personaId: resultado.personaId,
        archivoNombre: pieza.archivoRef.nombre,
        archivoTipo: pieza.archivoRef.mime,
        fechaVencimiento: instancia.requiereVencimiento ?
            fechaVencimiento : null,
      }, actor, {
        rutaRelativa: pieza.archivoRef.rutaRelativa,
        hashSha256: pieza.archivoRef.hashSha256,
        sesionId: resultado.sesionId,
      });
      // eslint-disable-next-line no-await-in-loop
      await evidenciaRequerimientoService.crearVinculo({
        evidenciaId: evidencia.id,
        expedienteRequerimientoId: enlace.expedienteRequerimientoId,
      }, actor);
      evidenciaIds.push(evidencia.id);
    }

    const evaluacion = await evaluacionService.crearEvaluacion({
      expedienteRequerimientoId: enlace.expedienteRequerimientoId,
      resultado: resultadoFinal,
      observaciones: observacion || (automatica ?
          "Evaluación automática por IA (Revisiones IA): todas las reglas " +
          "se cumplen." :
          "Evaluación asistida por IA (Revisiones IA)."),
      evidenciaIds,
      metodoVerificacion: "documental",
      fechaVencimiento: instancia.requiereVencimiento && fechaVencimiento ?
          fechaVencimiento : undefined,
    }, actor, {
      resultadoRevisionId: resultado.id,
      procesamientoIds: resultado.procesamientoIds,
    });
    return evaluacion.id;
  }

  /**
   * Resuelve un resultado.
   * @param {string} resultadoId ID del resultado.
   * @param {{accion: string, resultadoFinal: (string|undefined),
   *     observacion: (string|undefined), expedienteId: (string|undefined)}}
   *     payload Acción (con expedienteId, solo los enlaces de ese
   *     Expediente).
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{resultado: Object, evaluacionesCreadas: number,
   *     errores: Object[], mensaje: ?string}>} Resultado y detalle.
   */
  async resolver(resultadoId, payload, actor) {
    const {accion} = payload || {};
    const observacion = String(payload?.observacion || "").trim() || null;
    if (!ACCIONES.includes(accion)) {
      throw new AppError(400,
          `Acción no válida. Valores permitidos: ${ACCIONES.join(", ")}.`);
    }
    const resultado = await resultadoRevisionRepository.getById(resultadoId);
    if (!resultado) throw new AppError(404, "Resultado no encontrado.");
    if (resultado.estado !== "propuesto") {
      throw new AppError(409, "Este resultado ya fue resuelto.");
    }

    let resultadoFinal = null;
    if (accion === "aceptar") {
      if (!RESULTADOS_FINALES.includes(resultado.propuesta)) {
        throw new AppError(409, "La propuesta requiere revisión humana: " +
            "use Corregir e indique el resultado y una observación.");
      }
      resultadoFinal = resultado.propuesta;
    } else if (accion === "corregir") {
      resultadoFinal = payload.resultadoFinal;
      if (!RESULTADOS_FINALES.includes(resultadoFinal)) {
        throw new AppError(400,
            "Indique el resultado final: 'cumple' o 'no_cumple'.");
      }
      if (!observacion) {
        throw new AppError(400, "La observación es obligatoria al corregir.");
      }
    }
    let fechaVencimientoManual = null;
    if (accion === "corregir" && payload.fechaVencimiento) {
      fechaVencimientoManual = String(payload.fechaVencimiento);
      if (!/^d{4}-d{2}-d{2}$/.test(fechaVencimientoManual) ||
          isNaN(Date.parse(fechaVencimientoManual))) {
        throw new AppError(400,
            "La fecha de vencimiento debe tener el formato AAAA-MM-DD.");
      }
    }
    // Desde un Expediente: solo se evalúan sus enlaces.
    const expedienteId = payload.expedienteId ?
      String(payload.expedienteId) : null;
    return this._ejecutar({resultado, accion, resultadoFinal, observacion,
      actor, expedienteId, fechaVencimientoManual});
  }

  /**
   * Aplica la acción: crea las Evaluaciones (aceptar/corregir), marca el
   * resultado, suma métricas y deja el evento en la bitácora.
   * @param {Object} entrada Datos ya validados.
   * @return {Promise<Object>} Igual que `resolver`.
   */
  async _ejecutar({resultado, accion, resultadoFinal, observacion, actor,
    automatica = false, expedienteId = null, fechaVencimientoManual = null}) {
    const resultadoId = resultado.id;
    const evaluacionIds = [];
    const errores = [];
    let mensaje = null;
    if (accion !== "descartar") {
      const requeridos = (resultado.enlaces || []).filter((e) =>
        e.requerido && e.expedienteRequerimientoId &&
        (!expedienteId || e.expedienteId === expedienteId));
      if (requeridos.length === 0) {
        mensaje = "No hay expedientes que pidan este documento: no se " +
            "crearon evaluaciones.";
      } else {
        const piezas = (await Promise.all(resultado.procesamientoIds.map(
            (id) => procesamientoIARepository.getById(id),
        ))).filter(Boolean);
        for (const enlace of requeridos) {
          try {
            // eslint-disable-next-line no-await-in-loop
            evaluacionIds.push(await this._evaluarEnlace({
              resultado, enlace, piezas, resultadoFinal, observacion, actor,
              automatica, fechaVencimientoManual,
            }));
          } catch (error) {
            errores.push({
              expedienteId: enlace.expedienteId,
              mensaje: error.message || "Error al crear la evaluación.",
            });
          }
        }
        if (evaluacionIds.length === 0) {
          throw new AppError(409, "No se pudo crear ninguna evaluación: " +
              errores.map((e) => e.mensaje).join(" · "));
        }
      }
    }

    const usuario = await usuarioRepository.getById(actor.uid)
        .catch(() => null);
    const actualizado = await resultadoRevisionRepository.update(
        resultadoId, {
          estado: ESTADO_POR_ACCION[accion],
          resolucion: {
            resultadoFinal,
            observacion,
            fechaVencimiento: fechaVencimientoManual,
            resueltoPor: {
              uid: actor.uid,
              nombre: usuario ?
                `${usuario.nombre || ""} ${usuario.apellido || ""}`.trim() :
                actor.email || actor.uid,
            },
            resueltoAt: new Date(),
            automatica,
          },
          evaluacionIds,
        },
    );

    if (accion !== "descartar") {
      const tipo = await tipoDocumentalRepository.getByCodigo(
          resultado.tipoDocumentalCodigo,
      );
      if (tipo) {
        await tipoDocumentalRepository.incrementarMetricas(tipo.id,
            automatica ? {aceptadosAutomaticos: 1} :
            accion === "aceptar" ? {aceptadosSinCambio: 1} : {corregidos: 1});
      }
    }
    await bitacoraLogger.registrarEvento({
      mandanteId: resultado.mandanteId,
      entidad: "resultadosRevision",
      entidadId: resultadoId,
      accion: ESTADO_POR_ACCION[accion],
      actor,
      detalle: {
        sesionId: resultado.sesionId,
        tipoDocumental: resultado.tipoDocumentalCodigo,
        propuesta: resultado.propuesta, resultadoFinal, observacion,
        evaluacionIds, automatica, ...(errores.length ? {errores} : {}),
      },
    });
    return {
      resultado: actualizado,
      evaluacionesCreadas: evaluacionIds.length,
      errores,
      mensaje,
    };
  }
}

module.exports = new ResolucionService();
