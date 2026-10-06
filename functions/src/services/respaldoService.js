const {v1} = require("@google-cloud/firestore");
const admin = require("firebase-admin");
const {Timestamp} = require("firebase-admin/firestore");
const respaldoRepository = require("../repositories/respaldoRepository");
const respaldoNotificacionService =
    require("./respaldoNotificacionService");
const AppError = require("../utils/AppError");

const ZONA_HORARIA = "America/Santiago";
const FRASE_RESTAURAR = "RESTAURAR";
const ESPERA_RESPALDO_SEGURIDAD_MS = 90 * 1000;
const PASO_ESPERA_MS = 3000;

const CONFIG_POR_DEFECTO = {
  habilitado: false,
  intervaloDias: 7,
  horaEjecucion: "03:00",
  bucketDestino: "",
  retencionDias: 30,
  eliminarAntiguos: false,
  ultimaEjecucion: null,
  proximaEjecucion: null,
};

const MENSAJE_IAM =
    "Firestore no tiene permiso para usar el bucket de respaldos. " +
    "Requisito manual (una sola vez, en Google Cloud): confirmar que el " +
    "bucket existe y otorgar a la cuenta de servicio de Cloud Functions el " +
    "rol 'Cloud Datastore Import Export Admin' sobre ese bucket.";

/**
 * Respaldo y restauración de la base de datos con la exportación/
 * importación nativa de Firestore (v1.FirestoreAdminClient). Solo lo usa
 * el rol superadmin (la restricción se aplica en las rutas y se repite en
 * el servicio para las operaciones sensibles).
 */
class RespaldoService {
  /**
   * Cliente de administración de Firestore (se crea al primer uso).
   * @return {object} Cliente.
   */
  _cliente() {
    if (!this._admin) this._admin = new v1.FirestoreAdminClient();
    return this._admin;
  }

  /**
   * Ruta de la base de datos (default) del proyecto actual.
   * @return {string} `projects/<id>/databases/(default)`.
   */
  _rutaBaseDatos() {
    const proyecto = admin.app().options.projectId ||
        process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    return `projects/${proyecto}/databases/(default)`;
  }

  /**
   * Descompone un destino `gs://bucket/carpeta`.
   * @param {string} uri Destino.
   * @return {{bucket: string, prefijo: string}} Bucket y carpeta (sin
   *     barras en los extremos; vacía si no hay carpeta).
   */
  _parsearDestino(uri) {
    const m = /^gs:\/\/([a-z0-9][a-z0-9._-]{1,220}[a-z0-9])(\/.*)?$/
        .exec((uri || "").trim());
    if (!m) {
      throw new AppError(
          400,
          "El destino debe tener el formato gs://bucket/carpeta " +
          "(no es una ruta de servidor).",
      );
    }
    return {bucket: m[1], prefijo: (m[2] || "").replace(/^\/+|\/+$/g, "")};
  }

  /**
   * Traduce errores de la API de Firestore/Storage a mensajes accionables.
   * @param {Error} err Error original.
   * @return {AppError} Error con mensaje claro.
   */
  _traducirError(err) {
    if (err instanceof AppError) return err;
    const texto = `${err.message || ""}`;
    if (err.code === 7 || /PERMISSION_DENIED|permission|403/i.test(texto)) {
      return new AppError(424, `${MENSAJE_IAM} (Detalle: ${texto})`);
    }
    if (err.code === 5 || /not found|does not exist|NOT_FOUND/i.test(texto)) {
      return new AppError(
          424,
          "No se encontró el bucket o la ruta de respaldo. Verifica que " +
          `el bucket exista. (Detalle: ${texto})`,
      );
    }
    return new AppError(502, `La API de Firestore falló: ${texto}`);
  }

  /**
   * Instante (Date) de una hora `HH:MM` de Santiago en el día de `base`.
   * @param {Date} base Día de referencia.
   * @param {string} hhmm Hora `HH:MM`.
   * @return {Date} Instante UTC correspondiente.
   */
  _horaEnSantiago(base, hhmm) {
    const [h, min] = hhmm.split(":").map(Number);
    const dia = new Intl.DateTimeFormat("en-CA", {timeZone: ZONA_HORARIA})
        .format(base);
    const [y, mes, d] = dia.split("-").map(Number);
    const suposicion = Date.UTC(y, mes - 1, d, h, min);
    const partes = new Intl.DateTimeFormat("en-US", {
      timeZone: ZONA_HORARIA, hourCycle: "h23", year: "numeric",
      month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
    }).formatToParts(new Date(suposicion)).reduce((a, p) => {
      a[p.type] = Number(p.value);
      return a;
    }, {});
    const comoUtc = Date.UTC(
        partes.year, partes.month - 1, partes.day, partes.hour, partes.minute,
    );
    return new Date(suposicion - (comoUtc - suposicion));
  }

  /**
   * Próxima ejecución programada según la configuración.
   * @param {object} config Configuración (con `ultimaEjecucion` opcional).
   * @param {Date} ahora Instante actual.
   * @return {Date} Fecha de la próxima ejecución.
   */
  _calcularProxima(config, ahora) {
    const ultima = config.ultimaEjecucion?.toDate?.() || null;
    if (ultima) {
      const base = new Date(ultima.getTime() + config.intervaloDias * 864e5);
      const candidata = this._horaEnSantiago(base, config.horaEjecucion);
      return candidata < ahora ? ahora : candidata;
    }
    const hoy = this._horaEnSantiago(ahora, config.horaEjecucion);
    if (hoy >= ahora) return hoy;
    return this._horaEnSantiago(
        new Date(ahora.getTime() + 864e5), config.horaEjecucion,
    );
  }

  /**
   * Configuración vigente (con valores por defecto si aún no existe).
   * @return {Promise<object>} Configuración.
   */
  async obtenerConfiguracion() {
    const guardada = await respaldoRepository.getConfiguracion();
    return {...CONFIG_POR_DEFECTO, ...(guardada || {})};
  }

  /**
   * Suma el tamaño de los archivos de una exportación en el bucket.
   * @param {string} uriExportacion `gs://bucket/carpeta/...` de la salida.
   * @return {Promise<?number>} Bytes, o null si no se pudo calcular.
   */
  async _tamanoExportacion(uriExportacion) {
    try {
      const {bucket, prefijo} = this._parsearDestino(uriExportacion);
      const [archivos] = await admin.storage().bucket(bucket)
          .getFiles({prefix: prefijo ? `${prefijo}/` : undefined});
      return archivos.reduce((s, a) => s + Number(a.metadata.size || 0), 0);
    } catch (err) {
      console.error("⚠️ No se pudo calcular el tamaño del respaldo:", err);
      return null;
    }
  }

  /**
   * Aplica (o retira) la regla de ciclo de vida del bucket que elimina los
   * respaldos antiguos. Es configuración de infraestructura: la regla se
   * limita a la carpeta de respaldos (nunca al bucket completo).
   * @param {object} config Configuración a aplicar.
   * @return {Promise<?string>} Advertencia si no se pudo aplicar.
   */
  async _aplicarCicloDeVida(config) {
    try {
      const {bucket, prefijo} = this._parsearDestino(config.bucketDestino);
      if (config.eliminarAntiguos && !prefijo) {
        return "La eliminación automática requiere una carpeta en el " +
            "destino (gs://bucket/carpeta): se omitió para no afectar a " +
            "todo el bucket.";
      }
      const b = admin.storage().bucket(bucket);
      const [meta] = await b.getMetadata();
      const marca = `${prefijo}/`;
      const reglas = (meta.lifecycle?.rule || []).filter((r) => !(
        r.action?.type === "Delete" &&
        (r.condition?.matchesPrefix || []).includes(marca)
      ));
      if (config.eliminarAntiguos) {
        reglas.push({
          action: {type: "Delete"},
          condition: {age: config.retencionDias, matchesPrefix: [marca]},
        });
      }
      await b.setMetadata({lifecycle: {rule: reglas}});
      return null;
    } catch (err) {
      return "La configuración se guardó, pero no se pudo aplicar la " +
          `política de conservación del bucket: ${err.message}`;
    }
  }

  /**
   * Actualiza la configuración de respaldos (solo superadmin).
   * @param {object} payload Datos nuevos.
   * @param {object} actor Usuario autenticado.
   * @return {Promise<{configuracion: object, advertencia: ?string}>}
   *     Configuración guardada y advertencia opcional.
   */
  async actualizarConfiguracion(payload, actor) {
    this._exigirSuperadmin(actor);
    const actual = await this.obtenerConfiguracion();
    const nueva = {
      habilitado: Boolean(payload.habilitado),
      intervaloDias: Number(payload.intervaloDias),
      horaEjecucion: `${payload.horaEjecucion || actual.horaEjecucion}`,
      bucketDestino: `${payload.bucketDestino || ""}`.trim(),
      retencionDias: Number(payload.retencionDias ?? actual.retencionDias),
      eliminarAntiguos: Boolean(payload.eliminarAntiguos),
    };
    if (!Number.isInteger(nueva.intervaloDias) || nueva.intervaloDias < 1) {
      throw new AppError(400, "'intervaloDias' debe ser un entero positivo.");
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nueva.horaEjecucion)) {
      throw new AppError(400, "'horaEjecucion' debe tener formato HH:MM.");
    }
    if (!Number.isInteger(nueva.retencionDias) || nueva.retencionDias < 1) {
      throw new AppError(400, "'retencionDias' debe ser un entero positivo.");
    }
    if (nueva.habilitado || nueva.bucketDestino) {
      this._parsearDestino(nueva.bucketDestino);
    }

    const proxima = nueva.habilitado ?
      Timestamp.fromDate(this._calcularProxima(
          {...nueva, ultimaEjecucion: actual.ultimaEjecucion}, new Date(),
      )) : null;

    const configuracion = await respaldoRepository.setConfiguracion({
      ...nueva, proximaEjecucion: proxima, actualizadoPor: actor.email,
    });
    await respaldoRepository.crearRegistro({
      tipo: "configuracion", estado: "exitoso",
      bucketDestino: nueva.bucketDestino, iniciadoPor: actor.email,
      fechaFin: Timestamp.now(),
      detalle: {
        habilitado: nueva.habilitado, intervaloDias: nueva.intervaloDias,
        horaEjecucion: nueva.horaEjecucion,
      },
    });
    const advertencia = nueva.bucketDestino ?
        await this._aplicarCicloDeVida(nueva) : null;
    return {configuracion, advertencia};
  }

  /**
   * Verifica de verdad el acceso al destino: escribe y borra un archivo
   * mínimo en la carpeta de respaldos (permisos de Cloud Functions sobre
   * el bucket). No verifica el permiso de Firestore, que se comprueba con
   * el primer respaldo real.
   * @param {string} bucketDestino Destino `gs://bucket/carpeta`.
   * @param {object} actor Usuario autenticado.
   * @return {Promise<{ok: boolean}>} Resultado.
   */
  async probarAcceso(bucketDestino, actor) {
    this._exigirSuperadmin(actor);
    const {bucket, prefijo} = this._parsearDestino(bucketDestino);
    try {
      const archivo = admin.storage().bucket(bucket)
          .file(`${prefijo ? prefijo + "/" : ""}.prueba-acceso-${Date.now()}`);
      await archivo.save("prueba de acceso");
      await archivo.delete();
      return {ok: true};
    } catch (err) {
      throw this._traducirError(err);
    }
  }

  /**
   * Exige el rol superadmin (defensa adicional a la de las rutas).
   * @param {object} actor Usuario autenticado.
   * @return {void}
   */
  _exigirSuperadmin(actor) {
    if (!actor || actor.rol !== "superadmin") {
      throw new AppError(403, "Solo un superadmin puede usar esta función.");
    }
  }

  /**
   * Inicia una exportación de Firestore y la registra en el historial.
   * @param {string} iniciadoPor "sistema" o el email del usuario.
   * @return {Promise<object>} Registro creado (en_progreso o fallido).
   */
  async iniciarRespaldo(iniciadoPor) {
    const config = await this.obtenerConfiguracion();
    const {bucket, prefijo} = this._parsearDestino(config.bucketDestino);
    const carpeta = new Date().toISOString().replace(/[:.]/g, "-");
    const destino =
        `gs://${bucket}/${prefijo ? prefijo + "/" : ""}${carpeta}`;

    const registro = await respaldoRepository.crearRegistro({
      tipo: "respaldo", estado: "en_progreso",
      bucketDestino: destino, iniciadoPor,
    });
    try {
      const [operacion] = await this._cliente().exportDocuments({
        name: this._rutaBaseDatos(), outputUriPrefix: destino,
        collectionIds: [],
      });
      await respaldoRepository.actualizarRegistro(registro.id, {
        operationName: operacion.name,
      });
      await respaldoRepository.setConfiguracion({
        ultimaEjecucion: Timestamp.now(),
        proximaEjecucion: config.habilitado ? Timestamp.fromDate(
            this._calcularProxima(
                {...config, ultimaEjecucion: Timestamp.now()}, new Date(),
            )) : null,
      });
      return {...registro, operationName: operacion.name};
    } catch (err) {
      const traducido = this._traducirError(err);
      await respaldoRepository.actualizarRegistro(registro.id, {
        estado: "fallido", fechaFin: Timestamp.now(),
        errorMensaje: traducido.message,
      });
      throw traducido;
    }
  }

  /**
   * Respaldo manual inmediato (solo superadmin).
   * @param {object} actor Usuario autenticado.
   * @return {Promise<object>} Registro del respaldo iniciado.
   */
  async ejecutarManual(actor) {
    this._exigirSuperadmin(actor);
    return this.iniciarRespaldo(actor.email);
  }

  /**
   * Tarea programada (cada hora): además de iniciar un respaldo nuevo si
   * el automático está habilitado y ya corresponde, revisa el estado de
   * cualquier respaldo en curso (incluidos los manuales) — así un
   * respaldo manual también termina notificado por correo aunque nadie
   * vuelva a abrir el panel para verlo (`refrescarOperaciones` es el
   * único lugar que detecta la transición a "exitoso" y notifica).
   * @return {Promise<?object>} Registro del respaldo recién iniciado, o
   *     null si no tocaba iniciar uno nuevo.
   */
  async ejecutarProgramado() {
    await this.refrescarOperaciones();
    const config = await this.obtenerConfiguracion();
    if (!config.habilitado) return null;
    const proxima = config.proximaEjecucion?.toDate?.() || null;
    if (proxima && proxima > new Date()) return null;
    try {
      return await this.iniciarRespaldo("sistema");
    } catch (err) {
      console.error("❌ Respaldo programado fallido:", err.message);
      return null;
    }
  }

  /**
   * Actualiza el estado de las operaciones en curso consultando a Firestore
   * (y calcula el tamaño de los respaldos que terminaron bien).
   * @return {Promise<void>}
   */
  async refrescarOperaciones() {
    const registros = await respaldoRepository.listarRegistros(50);
    const enCurso = registros.filter(
        (r) => r.estado === "en_progreso" && r.operationName,
    );
    for (const r of enCurso) {
      try {
        const cliente = this._cliente();
        const op = r.tipo === "restauracion" ?
            await cliente.checkImportDocumentsProgress(r.operationName) :
            await cliente.checkExportDocumentsProgress(r.operationName);
        if (!op.done) continue;
        const cambios = {estado: "exitoso", fechaFin: Timestamp.now()};
        if (r.tipo === "respaldo") {
          cambios.rutaExportacion = op.result?.outputUriPrefix || null;
          cambios.tamanoBytes = cambios.rutaExportacion ?
              await this._tamanoExportacion(cambios.rutaExportacion) : null;
        }
        await respaldoRepository.actualizarRegistro(r.id, cambios);
        // Único punto donde un respaldo pasa a "exitoso": cubre tanto el
        // respaldo automático programado como el manual, sin duplicar
        // lógica. Las restauraciones no notifican (fuera de alcance).
        // Se espera (await) a propósito: en un Cloud Function la
        // instancia puede congelarse apenas se responde la petición, así
        // que un envío de correo "fire-and-forget" corre el riesgo de
        // quedar cortado a mitad de camino antes de llegar a Resend.
        if (r.tipo === "respaldo") {
          const resultado = await respaldoNotificacionService
              .notificarRespaldoExitoso({...r, ...cambios});
          await respaldoRepository.actualizarRegistro(r.id, {
            notificacionCorreo: resultado,
          });
        }
      } catch (err) {
        await respaldoRepository.actualizarRegistro(r.id, {
          estado: "fallido", fechaFin: Timestamp.now(),
          errorMensaje: this._traducirError(err).message,
        });
      }
    }
  }

  /**
   * Historial de operaciones (con estados al día).
   * @param {object} actor Usuario autenticado.
   * @return {Promise<object[]>} Registros, más reciente primero.
   */
  async listarHistorial(actor) {
    this._exigirSuperadmin(actor);
    await this.refrescarOperaciones();
    return respaldoRepository.listarRegistros(200);
  }

  /**
   * Espera a que termine un respaldo (para el respaldo de seguridad previo
   * a una restauración).
   * @param {string} registroId ID del registro del respaldo.
   * @return {Promise<object>} Registro final.
   */
  async _esperarRespaldo(registroId) {
    const limite = Date.now() + ESPERA_RESPALDO_SEGURIDAD_MS;
    while (Date.now() < limite) {
      await this.refrescarOperaciones();
      const r = await respaldoRepository.getRegistro(registroId);
      if (r.estado !== "en_progreso") return r;
      await new Promise((ok) => setTimeout(ok, PASO_ESPERA_MS));
    }
    return respaldoRepository.getRegistro(registroId);
  }

  /**
   * Restaura Firestore desde un respaldo exitoso (solo superadmin). Exige
   * la frase de confirmación exacta antes de hacer nada. Si se pide un
   * respaldo de seguridad previo y este no termina bien, NO se restaura.
   * @param {string} id ID del registro del respaldo a restaurar.
   * @param {{confirmacion: string, crearRespaldoSeguridad: boolean}} body
   *     Confirmación y opciones.
   * @param {object} actor Usuario autenticado.
   * @return {Promise<object>} Registro de la restauración iniciada.
   */
  async restaurar(id, body, actor) {
    this._exigirSuperadmin(actor);
    if ((body?.confirmacion || "") !== FRASE_RESTAURAR) {
      throw new AppError(
          400,
          `Confirmación inválida: escribe exactamente ${FRASE_RESTAURAR}.`,
      );
    }
    const origen = await respaldoRepository.getRegistro(id);
    if (!origen || origen.tipo !== "respaldo") {
      throw new AppError(404, "Respaldo no encontrado.");
    }
    if (origen.estado !== "exitoso" || !origen.rutaExportacion) {
      throw new AppError(409, "Solo se puede restaurar un respaldo exitoso.");
    }

    let seguridad = null;
    if (body.crearRespaldoSeguridad !== false) {
      const inicio = await this.iniciarRespaldo(actor.email);
      seguridad = await this._esperarRespaldo(inicio.id);
      if (seguridad.estado !== "exitoso") {
        throw new AppError(
            409,
            "No se restauró nada: el respaldo de seguridad previo " +
            (seguridad.estado === "fallido" ?
              `falló (${seguridad.errorMensaje}).` :
              "no terminó a tiempo. Reintenta cuando finalice."),
        );
      }
    }

    const registro = await respaldoRepository.crearRegistro({
      tipo: "restauracion", estado: "en_progreso",
      bucketDestino: origen.rutaExportacion, iniciadoPor: actor.email,
      respaldoOrigenId: id, respaldoSeguridadId: seguridad?.id || null,
    });
    try {
      const [operacion] = await this._cliente().importDocuments({
        name: this._rutaBaseDatos(),
        inputUriPrefix: origen.rutaExportacion, collectionIds: [],
      });
      await respaldoRepository.actualizarRegistro(registro.id, {
        operationName: operacion.name,
      });
      return {...registro, operationName: operacion.name};
    } catch (err) {
      const traducido = this._traducirError(err);
      await respaldoRepository.actualizarRegistro(registro.id, {
        estado: "fallido", fechaFin: Timestamp.now(),
        errorMensaje: traducido.message,
      });
      throw traducido;
    }
  }
}

module.exports = new RespaldoService();
module.exports.FRASE_RESTAURAR = FRASE_RESTAURAR;
