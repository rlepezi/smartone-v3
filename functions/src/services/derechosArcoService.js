const crypto = require("crypto");
const admin = require("firebase-admin");
const {FieldValue, Timestamp} = require("firebase-admin/firestore");
const evidenciaRepository = require("../repositories/evidenciaRepository");
const evidenciaRequerimientoRepository =
    require("../repositories/evidenciaRequerimientoRepository");
const expedienteRequerimientoRepository =
    require("../repositories/expedienteRequerimientoRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");

const db = admin.firestore();
const MOTIVO_MAX_LENGTH = 500;
const DIAS_GRACIA_DEFECTO = 30;
const ACTOR_SISTEMA = {uid: "sistema", email: "sistema", rol: "sistema"};

/**
 * Derechos ARCO (Ley 21.719): derecho de cancelación de una Persona.
 * Resuelve el choque con "nunca eliminar físicamente" anonimizando la
 * identidad de la Persona y conservando toda la estructura (Relaciones
 * laborales, participaciones en proyectos, Evaluaciones, Expedientes y
 * Bitácora), que
 * siguen referenciando el mismo `personaId`. Sus documentos de identidad
 * (Evidencias de Requerimientos marcados `esDocumentoIdentidad`) no se
 * borran al instante: pasan por un periodo de gracia con acceso
 * restringido y luego un job elimina el archivo físico. Alcance: solo
 * Persona (persona natural); Empresa y Mandante son entidades legales.
 */
class DerechosArcoService {
  /**
   * Exige el rol superadmin.
   * @param {Object} actor Usuario autenticado.
   * @param {string} accion Descripción de la acción, para el mensaje.
   * @return {void}
   */
  _exigirSuperadmin(actor, accion) {
    if (!actor || actor.rol !== "superadmin") {
      throw new AppError(403, `Solo un superadmin puede ${accion}.`);
    }
  }

  /**
   * Valida y normaliza el motivo de una acción sensible.
   * @param {*} motivo Valor recibido.
   * @return {string} Motivo limpio.
   */
  _validarMotivo(motivo) {
    const limpio = typeof motivo === "string" ? motivo.trim() : "";
    if (!limpio) {
      throw new AppError(400, "El campo 'motivo' es obligatorio.");
    }
    if (limpio.length > MOTIVO_MAX_LENGTH) {
      throw new AppError(
          400,
          `'motivo' no puede superar ${MOTIVO_MAX_LENGTH} caracteres.`,
      );
    }
    return limpio;
  }

  /**
   * Días del periodo de gracia antes de eliminar los documentos de
   * identidad (configurable; 30 por defecto).
   * @return {Promise<number>} Días.
   */
  async obtenerDiasGracia() {
    const doc = await db.collection("configuracionPrivacidad")
        .doc("principal").get();
    const dias = doc.exists ? Number(doc.data().diasGraciaPurga) : NaN;
    return Number.isInteger(dias) && dias >= 1 ? dias : DIAS_GRACIA_DEFECTO;
  }

  /**
   * Cambia el periodo de gracia (solo superadmin).
   * @param {*} dias Días (entero entre 1 y 3650).
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{diasGraciaPurga: number}>} Valor guardado.
   */
  async actualizarDiasGracia(dias, actor) {
    this._exigirSuperadmin(actor, "cambiar el periodo de gracia");
    const n = Number(dias);
    if (!Number.isInteger(n) || n < 1 || n > 3650) {
      throw new AppError(
          400, "'diasGraciaPurga' debe ser un entero entre 1 y 3650.",
      );
    }
    await db.collection("configuracionPrivacidad").doc("principal").set({
      diasGraciaPurga: n, actualizadoPor: actor.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {diasGraciaPurga: n};
  }

  /**
   * Evidencias de una Persona cuyo Requerimiento está clasificado como
   * documento de identidad (clasificación manual del Requerimiento).
   * @param {string} personaId ID de la Persona.
   * @return {Promise<Object[]>} Evidencias de identidad (no purgadas ya).
   */
  async _evidenciasDeIdentidad(personaId) {
    const evidencias = await evidenciaRepository.listByPersona(personaId);
    const cacheReq = {};
    const resultado = [];
    for (const evidencia of evidencias) {
      if (evidencia.eliminadaFisicamente) continue;
      const vinculos =
          await evidenciaRequerimientoRepository.listByEvidencia(evidencia.id);
      let esIdentidad = false;
      // La instancia guarda la marca congelada al crearse (no depende de
      // ediciones posteriores del catálogo).
      for (const v of vinculos) {
        const id = v.expedienteRequerimientoId;
        if (!id) continue;
        if (!(id in cacheReq)) {
          cacheReq[id] = await expedienteRequerimientoRepository.getById(id);
        }
        if (cacheReq[id]?.esDocumentoIdentidad === true) esIdentidad = true;
      }
      if (esIdentidad) resultado.push(evidencia);
    }
    return resultado;
  }

  /**
   * Cuántos documentos de identidad quedarían afectados y en cuántos días
   * se eliminarían (para informarlo antes de confirmar).
   * @param {string} personaId ID de la Persona.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{documentos: number, diasGracia: number}>} Impacto.
   */
  async impactoAnonimizacion(personaId, actor) {
    this._exigirSuperadmin(actor, "consultar el impacto de la anonimización");
    const [evidencias, diasGracia] = await Promise.all([
      this._evidenciasDeIdentidad(personaId), this.obtenerDiasGracia(),
    ]);
    return {documentos: evidencias.length, diasGracia};
  }

  /**
   * Descompone la URL de descarga de Firebase Storage.
   * @param {string} url URL de descarga.
   * @return {?{bucket: string, ruta: string}} Bucket y ruta, o null.
   */
  _parsearUrlStorage(url) {
    const m = /\/v0\/b\/([^/]+)\/o\/([^?]+)/.exec(url || "");
    return m ? {bucket: m[1], ruta: decodeURIComponent(m[2])} : null;
  }

  /**
   * Revoca las URLs de descarga ya entregadas rotando el token del
   * archivo (las URLs de Firebase Storage funcionan sin autenticación
   * mientras su token sea válido).
   * @param {string} url URL de descarga actual.
   * @return {Promise<?string>} Nueva URL, o null si no se pudo rotar.
   */
  async _rotarTokenDescarga(url) {
    const partes = this._parsearUrlStorage(url);
    if (!partes) return null;
    try {
      const token = crypto.randomUUID();
      await admin.storage().bucket(partes.bucket).file(partes.ruta)
          .setMetadata({metadata: {firebaseStorageDownloadTokens: token}});
      return `https://firebasestorage.googleapis.com/v0/b/${partes.bucket}` +
          `/o/${encodeURIComponent(partes.ruta)}?alt=media&token=${token}`;
    } catch (err) {
      console.error("⚠️ No se pudo rotar el token de descarga:", err.message);
      return null;
    }
  }

  /**
   * Marca los documentos de identidad de una Persona para eliminación
   * futura y restringe su acceso de inmediato.
   * @param {string} personaId ID de la Persona.
   * @return {Promise<{marcadas: number, diasGracia: number,
   *     sinRevocarUrl: number}>} Resultado.
   */
  async _marcarDocumentosIdentidad(personaId) {
    const [evidencias, diasGracia] = await Promise.all([
      this._evidenciasDeIdentidad(personaId), this.obtenerDiasGracia(),
    ]);
    const limite = Timestamp.fromDate(
        new Date(Date.now() + diasGracia * 864e5),
    );
    let sinRevocarUrl = 0;
    for (const e of evidencias) {
      const nuevaUrl = await this._rotarTokenDescarga(e.archivoUrl);
      if (!nuevaUrl) sinRevocarUrl++;
      await evidenciaRepository.update(e.id, {
        accesoRestringido: true,
        pendienteEliminacionPorAnonimizacion: true,
        fechaLimiteEliminacion: limite,
        ...(nuevaUrl ? {archivoUrl: nuevaUrl} : {}),
      });
    }
    return {marcadas: evidencias.length, diasGracia, sinRevocarUrl};
  }

  /**
   * Anonimiza los datos personales de una Persona. Acción excepcional,
   * irreversible desde la aplicación (el dato original no se guarda en
   * ningún lado). Solo superadmin, con motivo obligatorio. Sus documentos
   * de identidad quedan marcados para eliminación tras el periodo de gracia.
   * @param {string} personaId ID de la Persona.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @param {string} motivo Por qué se ejecuta (solicitud del titular,
   *     orden de la Agencia, etc.).
   * @return {Promise<Object>} Persona anonimizada y resumen de purga.
   */
  async anonimizarPersona(personaId, actor, motivo) {
    this._exigirSuperadmin(actor, "anonimizar a una Persona");
    if (!personaId || typeof personaId !== "string") {
      throw new AppError(400, "ID de persona inválido.");
    }
    const motivoLimpio = this._validarMotivo(motivo);

    const ref = db.collection("personas").doc(personaId);
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new AppError(404, "Persona no encontrada.");
      if (doc.data().anonimizada === true) {
        throw new AppError(409, "Esta Persona ya fue anonimizada.");
      }
      // Solo cambia la identidad de la Persona: ninguna otra colección
      // se toca aquí. El RUT deja de ser el real pero conserva unicidad.
      tx.update(ref, {
        nombre: "Persona Anonimizada",
        apellido: "",
        rut: `ANONIMIZADO-${personaId}`,
        profesion: FieldValue.delete(),
        telefono: FieldValue.delete(),
        email: FieldValue.delete(),
        direccion: FieldValue.delete(),
        anonimizada: true,
        fechaAnonimizacion: FieldValue.serverTimestamp(),
        anonimizadaPor: actor.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    // Documentos de identidad: periodo de gracia, nunca borrado inmediato.
    const purga = await this._marcarDocumentosIdentidad(personaId);

    // El motivo queda auditado; jamás se registra el dato original.
    await bitacoraLogger.registrarEvento({
      mandanteId: null,
      entidad: "persona",
      entidadId: personaId,
      accion: "anonimizacion_persona",
      actor,
      detalle: {
        motivo: motivoLimpio,
        documentosMarcadosParaEliminacion: purga.marcadas,
        diasGracia: purga.diasGracia,
      },
    });

    return {
      id: personaId, ...(await ref.get()).data(),
      documentosMarcados: purga.marcadas, diasGracia: purga.diasGracia,
    };
  }

  /**
   * Indica si una Persona ya fue anonimizada.
   * @param {string} personaId ID de la Persona.
   * @return {Promise<boolean>} true si está anonimizada.
   */
  async estaAnonimizada(personaId) {
    const doc = await db.collection("personas").doc(personaId).get();
    return doc.exists && doc.data().anonimizada === true;
  }

  /**
   * Documentos de identidad de una Persona anonimizada con su estado de
   * purga (pendiente con fecha límite, o ya eliminada). Solo superadmin.
   * @param {string} personaId ID de la Persona.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Documentos con su estado.
   */
  async listarDocumentosPurga(personaId, actor) {
    this._exigirSuperadmin(actor, "ver la purga de documentos");
    const evidencias = await evidenciaRepository.listByPersona(personaId);
    return evidencias
        .filter((e) => e.pendienteEliminacionPorAnonimizacion ||
            e.eliminadaFisicamente || e.purgaCancelada)
        .map((e) => ({
          id: e.id,
          expedienteId: e.expedienteId,
          archivoNombre: e.archivoNombre,
          pendiente: e.pendienteEliminacionPorAnonimizacion === true,
          eliminadaFisicamente: e.eliminadaFisicamente === true,
          purgaCancelada: e.purgaCancelada === true,
          fechaLimiteEliminacion: e.fechaLimiteEliminacion || null,
          fechaEliminacionFisica: e.fechaEliminacionFisica || null,
        }));
  }

  /**
   * Cancela la eliminación programada de una Evidencia (excepción manual,
   * p. ej. por una razón legal para conservarla). Requiere motivo.
   * @param {string} evidenciaId ID de la Evidencia.
   * @param {string} motivo Motivo de la excepción.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Evidencia actualizada.
   */
  async cancelarPurga(evidenciaId, motivo, actor) {
    this._exigirSuperadmin(actor, "cancelar una eliminación programada");
    const motivoLimpio = this._validarMotivo(motivo);
    const evidencia = await evidenciaRepository.getById(evidenciaId);
    if (!evidencia) throw new AppError(404, "Evidencia no encontrada.");
    if (!evidencia.pendienteEliminacionPorAnonimizacion) {
      throw new AppError(
          409, "Esta Evidencia no tiene una eliminación pendiente.",
      );
    }
    const actualizada = await evidenciaRepository.update(evidenciaId, {
      pendienteEliminacionPorAnonimizacion: false,
      fechaLimiteEliminacion: null,
      purgaCancelada: true,
    });
    await bitacoraLogger.registrarEvento({
      mandanteId: evidencia.mandanteId || null,
      entidad: "evidencia",
      entidadId: evidenciaId,
      accion: "cancelacion_purga_evidencia",
      actor,
      detalle: {motivo: motivoLimpio, personaId: evidencia.personaId},
    });
    return actualizada;
  }

  /**
   * Job diario: elimina el archivo físico de las Evidencias cuyo plazo de
   * gracia venció. El documento de Firestore NO se borra: queda como
   * registro histórico, marcado `eliminadaFisicamente` y sin acceso al
   * archivo real (ni URL, ni nombre original).
   * @return {Promise<{eliminadas: number, fallidas: number}>} Resultado.
   */
  async purgarVencidas() {
    const ahora = Date.now();
    const pendientes = await evidenciaRepository.listPendientesPurga();
    let eliminadas = 0;
    let fallidas = 0;
    for (const e of pendientes) {
      const limite = e.fechaLimiteEliminacion?.toMillis?.() || 0;
      if (!limite || limite > ahora) continue;
      try {
        const partes = this._parsearUrlStorage(e.archivoUrl);
        if (partes) {
          await admin.storage().bucket(partes.bucket).file(partes.ruta)
              .delete({ignoreNotFound: true});
        }
        await evidenciaRepository.update(e.id, {
          eliminadaFisicamente: true,
          fechaEliminacionFisica: FieldValue.serverTimestamp(),
          pendienteEliminacionPorAnonimizacion: false,
          fechaLimiteEliminacion: null,
          archivoUrl: null,
          archivoNombre: "Documento de identidad eliminado",
        });
        await bitacoraLogger.registrarEvento({
          mandanteId: e.mandanteId || null,
          entidad: "evidencia",
          entidadId: e.id,
          accion: "purga_documento_identidad",
          actor: ACTOR_SISTEMA,
          detalle: {personaId: e.personaId},
        });
        eliminadas++;
      } catch (err) {
        fallidas++;
        console.error(`❌ No se pudo purgar la evidencia ${e.id}:`, err);
      }
    }
    return {eliminadas, fallidas};
  }
}

module.exports = new DerechosArcoService();
