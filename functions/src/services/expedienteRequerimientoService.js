const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const expedienteRequerimientoRepository =
    require("../repositories/expedienteRequerimientoRepository");
const expedienteRepository = require("../repositories/expedienteRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const participacionRepository =
    require("../repositories/participacionRepository");
const evaluacionRepository = require("../repositories/evaluacionRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const requerimientoCalculoService = require("./requerimientoCalculoService");
const reutilizacionDocumentalService =
    require("./reutilizacionDocumentalService");
const {sujetosActivosDeParticipacion} =
    require("../utils/sujetosParticipacion");
const {aplicaRequerimientoASujeto} =
    require("../utils/aplicabilidadRequerimiento");
const {
  campoDeResultado, claveSujeto, resumirInstancias,
} = require("../utils/cumplimiento");
const {resumirVencimientos} = require("../utils/vencimientos");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");

const db = admin.firestore();

// Máximo de operaciones por lote de escritura (Firestore admite 500; se deja
// margen). Cada lote incluye además la actualización de contadores del
// Expediente.
const MAX_OPERACIONES_LOTE = 400;
// Reintentos de una sincronización cuando otra escritura cambió una
// instancia entre la lectura y el lote (precondición fallida) o creó la
// misma instancia (ya existe).
const MAX_INTENTOS = 3;
// Campos de cada contador (resumen y resumenSujetos.<clave>).
const CAMPOS_RESUMEN = [
  "activas", "cumple", "noCumple", "noAplica", "pendiente",
];
// Códigos gRPC de Firestore.
const ALREADY_EXISTS = 6;
const FAILED_PRECONDITION = 9;

/**
 * Error que corta una generación a propósito (solo pruebas: simula una
 * generación interrumpida para verificar que el reintento no duplica).
 */
class GeneracionInterrumpida extends Error {}

/**
 * Instancias de Requerimiento por Expediente (expedienteRequerimientos):
 * generación, sincronización y contadores. Es el ÚNICO lugar (junto con las
 * vistas previas) que usa la regla de aplicabilidad: el resto del sistema
 * lee instancias.
 *
 * Sincronizar es idempotente: calcula las instancias que deben existir
 * (configuración del Perfil + reglas manuales del Expediente, por cada
 * sujeto activo), y crea las que faltan, reactiva las retiradas que vuelven
 * a aplicar y retira las activas que dejaron de aplicar. Nunca borra, ni
 * toca evaluaciones o evidencias. Las nuevas pasan por la reutilización
 * documental. Escribe en lotes de hasta 400 operaciones; cada lote ajusta
 * los contadores del Expediente (resumen y resumenSujetos) con incrementos.
 */
class ExpedienteRequerimientoService {
  /**
   * Convierte un valor a Date.
   * @param {*} valor Timestamp, Date o string.
   * @return {?Date} Fecha o null.
   */
  _aFecha(valor) {
    if (!valor) return null;
    if (typeof valor.toDate === "function") return valor.toDate();
    const fecha = new Date(valor);
    return isNaN(fecha.getTime()) ? null : fecha;
  }

  /**
   * Quita campos internos antes de responder al cliente.
   * @param {Object} instancia Instancia leída del repositorio.
   * @return {Object} Instancia pública.
   */
  publica(instancia) {
    if (!instancia) return instancia;
    const copia = {...instancia};
    delete copia._updateTime;
    return copia;
  }

  /**
   * ID del sujeto de una instancia.
   * @param {Object} sujeto {tipoEntidad, empresaId, personaId, recursoId}.
   * @return {string} ID.
   */
  _sujetoId(sujeto) {
    if (sujeto.tipoEntidad === "persona") return sujeto.personaId;
    if (sujeto.tipoEntidad === "recurso") return sujeto.recursoId;
    return sujeto.empresaId;
  }

  /**
   * Entradas que generan instancias en un Expediente: la configuración
   * vigente del Perfil de Participación y las reglas manuales del propio
   * Expediente (aplican a todos los sujetos de su tipo).
   * @param {Object} expediente Expediente.
   * @return {Promise<Array<{entrada: Object, origen: string}>>} Entradas.
   */
  async _entradas(expediente) {
    const configuracion =
        await requerimientoCalculoService.calcularRequerimientosAplicables(
            expediente.perfilParticipacionId,
        );
    const manuales = expediente.requerimientosManuales || [];
    const requerimientos = await Promise.all(
        manuales.map((m) => requerimientoRepository.getById(m.requerimientoId)),
    );
    const entradasManuales = requerimientos
        .filter(Boolean)
        .map((r) => requerimientoCalculoService.construirEntrada(
            r, [{perfilRecursoId: null, orden: null}],
        ));
    return [
      ...configuracion.map((entrada) => ({entrada, origen: "configuracion"})),
      ...entradasManuales.map((entrada) => ({
        entrada, origen: "agregado_manual",
      })),
    ];
  }

  /**
   * Instancias que DEBEN existir activas (función pura).
   * @param {Object} expediente Expediente.
   * @param {Array<{entrada: Object, origen: string}>} entradas Entradas.
   * @param {Object[]} sujetos Sujetos activos de la Participación.
   * @return {Map<string, {entrada: Object, sujeto: Object, origen: string}>}
   *     Por ID de instancia. Si un Requerimiento llega por configuración y
   *     por regla manual, prevalece la configuración.
   */
  calcularEsperadas(expediente, entradas, sujetos) {
    const empresa = {tipoEntidad: "empresa", empresaId: expediente.empresaId};
    const todos = [empresa, ...sujetos];
    const esperadas = new Map();
    const ordenadas = [
      ...entradas.filter((e) => e.origen === "configuracion"),
      ...entradas.filter((e) => e.origen !== "configuracion"),
    ];
    ordenadas.forEach(({entrada, origen}) => {
      todos.forEach((sujeto) => {
        if (!aplicaRequerimientoASujeto(entrada, sujeto)) return;
        const id = expedienteRequerimientoRepository.idPara(
            expediente.id, entrada.requerimientoId, this._sujetoId(sujeto),
        );
        if (!esperadas.has(id)) esperadas.set(id, {entrada, sujeto, origen});
      });
    });
    return esperadas;
  }

  /**
   * Datos de una instancia nueva: copia CONGELADA del Requerimiento
   * (editar el catálogo después no la modifica).
   * @param {Object} expediente Expediente.
   * @param {{entrada: Object, sujeto: Object, origen: string}} esperada
   *     Instancia esperada.
   * @return {Object} Datos del documento.
   */
  _datosNueva(expediente, {entrada, sujeto, origen}) {
    return {
      expedienteId: expediente.id,
      mandanteId: expediente.mandanteId,
      requerimientoId: entrada.requerimientoId,
      tipoEntidad: entrada.tipoEntidad,
      empresaId: sujeto.tipoEntidad === "empresa" ? sujeto.empresaId : null,
      personaId: sujeto.tipoEntidad === "persona" ? sujeto.personaId : null,
      recursoId: sujeto.tipoEntidad === "recurso" ? sujeto.recursoId : null,
      nombre: entrada.nombre,
      nombreCorto: entrada.nombreCorto || entrada.nombre,
      requiereVencimiento: Boolean(entrada.requiereVencimiento),
      esDocumentoIdentidad: Boolean(entrada.esDocumentoIdentidad),
      orden: typeof entrada.orden === "number" ? entrada.orden : null,
      origen,
      estado: "activo",
      resultado: "pendiente",
      evaluacionVigenteId: null,
      fechaVencimiento: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
  }

  /**
   * Busca Evaluaciones reutilizables para las instancias nuevas, por
   * sujeto (mismo motor y criterio que siempre).
   * @param {Object} expediente Expediente.
   * @param {Array<{id: string, esperada: Object}>} nuevas Instancias nuevas.
   * @param {?Date} fechaParticipacion Inicio de la Participación.
   * @return {Promise<Map<string, Object>>} ID de instancia -> Evaluación
   *     original a reutilizar.
   */
  async _reutilizables(expediente, nuevas, fechaParticipacion) {
    const porSujeto = new Map();
    nuevas.forEach((n) => {
      const clave = claveSujeto(n.esperada.sujeto);
      if (!porSujeto.has(clave)) porSujeto.set(clave, []);
      porSujeto.get(clave).push(n);
    });
    const resultado = new Map();
    for (const lista of porSujeto.values()) {
      const {sujeto} = lista[0].esperada;
      const entradas = lista.map((n) => n.esperada.entrada);
      const fecha = this._aFecha(sujeto.fechaInicio) || fechaParticipacion ||
          new Date();
      let encontrados;
      if (sujeto.tipoEntidad === "persona") {
        // eslint-disable-next-line no-await-in-loop
        encontrados = await reutilizacionDocumentalService
            .buscarReutilizablesPersona(
                sujeto.personaId, entradas, fecha, expediente.mandanteId,
            );
      } else if (sujeto.tipoEntidad === "recurso") {
        // eslint-disable-next-line no-await-in-loop
        encontrados = await reutilizacionDocumentalService
            .buscarReutilizablesRecurso(
                sujeto.recursoId, entradas, fecha, expediente.mandanteId,
            );
      } else {
        // eslint-disable-next-line no-await-in-loop
        encontrados = await reutilizacionDocumentalService
            .buscarReutilizablesEmpresa(
                sujeto.empresaId, entradas, fecha, expediente.mandanteId,
            );
      }
      const porRequerimiento = new Map(
          encontrados
              .filter((ev) => ev.expedienteId !== expediente.id)
              .map((ev) => [ev.requerimientoId, ev]),
      );
      lista.forEach((n) => {
        const original =
            porRequerimiento.get(n.esperada.entrada.requerimientoId);
        if (original) resultado.set(n.id, original);
      });
    }
    return resultado;
  }

  /**
   * Nombre del actor para las Evaluaciones reutilizadas.
   * @param {Object} actor Usuario.
   * @return {Promise<string>} Nombre.
   */
  async _nombreActor(actor) {
    const usuario = actor?.uid ? await usuarioRepository.getById(actor.uid) :
      null;
    return usuario ?
      `${usuario.nombre} ${usuario.apellido}`.trim() :
      actor?.email || "Sistema";
  }

  /**
   * Agrega a `deltas` el cambio de contadores de una instancia.
   * @param {Object<string, number>} deltas Acumulado por ruta de campo.
   * @param {Object} instancia Instancia (para la clave del sujeto).
   * @param {string} campo Campo del resumen ("activas", "cumple", ...).
   * @param {number} n Variación.
   * @return {void}
   */
  _delta(deltas, instancia, campo, n) {
    const clave = claveSujeto(instancia);
    // Todos los campos del sujeto viajan en el lote (con incremento 0 si no
    // cambian): así un sujeto nuevo nace con sus 5 contadores, no solo con
    // los que se tocaron.
    CAMPOS_RESUMEN.forEach((c) => {
      const r = `resumen.${c}`;
      const s = `resumenSujetos.${clave}.${c}`;
      deltas[r] = deltas[r] || 0;
      deltas[s] = deltas[s] || 0;
    });
    deltas[`resumen.${campo}`] += n;
    deltas[`resumenSujetos.${clave}.${campo}`] += n;
  }

  /**
   * Escribe unidades en lotes de hasta MAX_OPERACIONES_LOTE operaciones.
   * Cada unidad (sus escrituras + sus deltas de contadores) queda entera en
   * un mismo lote, junto con la actualización de contadores del Expediente.
   * @param {string} expedienteId ID del Expediente.
   * @param {Array<{escrituras: Function[], deltas: Object}>} unidades
   *     Escrituras (funciones que reciben el lote) y deltas.
   * @param {{interrumpirTrasLotes: (number|undefined)}} opciones Solo
   *     pruebas: corta después de N lotes.
   * @return {Promise<number>} Lotes escritos.
   */
  async _escribirEnLotes(expedienteId, unidades, opciones = {}) {
    const expedienteRef = db.collection(expedienteRepository.COLLECTION)
        .doc(expedienteId);
    const lotes = [];
    let actual = {unidades: [], ops: 0};
    unidades.forEach((u) => {
      if (actual.ops + u.escrituras.length > MAX_OPERACIONES_LOTE - 1) {
        lotes.push(actual);
        actual = {unidades: [], ops: 0};
      }
      actual.unidades.push(u);
      actual.ops += u.escrituras.length;
    });
    if (actual.unidades.length) lotes.push(actual);

    let escritos = 0;
    for (const lote of lotes) {
      if (opciones.interrumpirTrasLotes !== undefined &&
          escritos >= opciones.interrumpirTrasLotes) {
        throw new GeneracionInterrumpida(
            `Generación interrumpida tras ${escritos} lote(s).`,
        );
      }
      const batch = db.batch();
      const deltas = {};
      lote.unidades.forEach((u) => {
        u.escrituras.forEach((escribir) => escribir(batch));
        Object.entries(u.deltas).forEach(([ruta, n]) => {
          deltas[ruta] = (deltas[ruta] || 0) + n;
        });
      });
      const actualizacion = {updatedAt: FieldValue.serverTimestamp()};
      Object.entries(deltas).forEach(([ruta, n]) => {
        actualizacion[ruta] = FieldValue.increment(n);
      });
      batch.update(expedienteRef, actualizacion);
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
      escritos++;
    }
    return escritos;
  }

  /**
   * Sincroniza las instancias de un Expediente (ver encabezado de la
   * clase). Los Expedientes cerrados no se tocan. Reintenta si una
   * escritura concurrente cambió alguna instancia entre la lectura y el
   * lote.
   * @param {string} expedienteId ID del Expediente.
   * @param {Object} actor Usuario que originó el cambio.
   * @param {{motivo: (string|undefined),
   *     interrumpirTrasLotes: (number|undefined)}} [opciones] Opciones.
   * @return {Promise<{creadas: number, reactivadas: number,
   *     retiradas: number, reutilizadas: number}>} Cambios aplicados.
   */
  async sincronizar(expedienteId, actor, opciones = {}) {
    let ultimoError;
    for (let intento = 0; intento < MAX_INTENTOS; intento++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await this._sincronizarUnaVez(expedienteId, actor, opciones);
      } catch (err) {
        if (![ALREADY_EXISTS, FAILED_PRECONDITION].includes(err.code)) {
          throw err;
        }
        ultimoError = err;
      }
    }
    throw ultimoError;
  }

  /**
   * Un intento de sincronización.
   * @param {string} expedienteId ID del Expediente.
   * @param {Object} actor Usuario.
   * @param {Object} opciones Ver sincronizar.
   * @return {Promise<Object>} Cambios aplicados.
   */
  async _sincronizarUnaVez(expedienteId, actor, opciones) {
    const sinCambios = {creadas: 0, reactivadas: 0, retiradas: 0,
      reutilizadas: 0};
    const expediente = await expedienteRepository.getById(expedienteId);
    if (!expediente || expediente.estado === "cerrado") return sinCambios;

    const [entradas, sujetos, existentes, participacion] = await Promise.all([
      this._entradas(expediente),
      sujetosActivosDeParticipacion(expediente.participacionId),
      expedienteRequerimientoRepository.listByExpediente(expedienteId),
      participacionRepository.getById(expediente.participacionId),
    ]);
    const esperadas = this.calcularEsperadas(expediente, entradas, sujetos);
    const existentesPorId = new Map(existentes.map((i) => [i.id, i]));

    const nuevas = [];
    const reactivar = [];
    const retirar = [];
    esperadas.forEach((esperada, id) => {
      const existente = existentesPorId.get(id);
      if (!existente) nuevas.push({id, esperada});
      else if (existente.estado !== "activo") reactivar.push(existente);
    });
    existentes.forEach((i) => {
      if (i.estado === "activo" && !esperadas.has(i.id)) retirar.push(i);
    });
    if (!nuevas.length && !reactivar.length && !retirar.length) {
      return sinCambios;
    }

    const reutilizables = await this._reutilizables(
        expediente, nuevas, this._aFecha(participacion?.fechaInicio),
    );
    const creadoPorNombre = reutilizables.size ?
        await this._nombreActor(actor) : null;

    const unidades = [];
    nuevas.forEach(({id, esperada}) => {
      const datos = this._datosNueva(expediente, esperada);
      const deltas = {};
      const escrituras = [];
      const original = reutilizables.get(id);
      if (original) {
        const evaluacionRef = db.collection(evaluacionRepository.COLLECTION)
            .doc();
        datos.resultado = "cumple";
        datos.evaluacionVigenteId = evaluacionRef.id;
        datos.fechaVencimiento = original.fechaVencimiento || null;
        const evaluacion = reutilizacionDocumentalService.datosReutilizada(
            original, {
              expedienteId, expedienteRequerimientoId: id,
              mandanteId: expediente.mandanteId, actor, creadoPorNombre,
            },
        );
        escrituras.push((b) => b.create(evaluacionRef, evaluacion));
      }
      escrituras.push((b) => b.create(
          expedienteRequerimientoRepository.ref(id), datos,
      ));
      this._delta(deltas, datos, "activas", 1);
      this._delta(deltas, datos, campoDeResultado(datos.resultado), 1);
      unidades.push({escrituras, deltas});
    });
    const cambiarEstado = (instancia, estado, signo) => {
      const deltas = {};
      this._delta(deltas, instancia, "activas", signo);
      this._delta(deltas, instancia, campoDeResultado(instancia.resultado),
          signo);
      unidades.push({
        escrituras: [(b) => b.update(
            expedienteRequerimientoRepository.ref(instancia.id),
            {estado, updatedAt: FieldValue.serverTimestamp()},
            {lastUpdateTime: instancia._updateTime},
        )],
        deltas,
      });
    };
    reactivar.forEach((i) => cambiarEstado(i, "activo", 1));
    retirar.forEach((i) => cambiarEstado(i, "retirado", -1));

    await this._escribirEnLotes(expedienteId, unidades, opciones);
    // Las instancias nuevas (reutilizadas, con su fecha), retiradas o
    // reactivadas cambian la fecha de vencimiento más próxima: se recalcula
    // aparte (mejor esfuerzo).
    try {
      await this.recalcularVencimientos(expedienteId);
    } catch (err) {
      console.error(
          `Error al recalcular vencimientos del Expediente ${expedienteId}:`,
          err,
      );
    }

    const cambios = {
      creadas: nuevas.length,
      reactivadas: reactivar.length,
      retiradas: retirar.length,
      reutilizadas: reutilizables.size,
    };
    await bitacoraLogger.registrarEvento({
      mandanteId: expediente.mandanteId,
      entidad: "expediente",
      entidadId: expedienteId,
      accion: "instancias_sincronizadas",
      actor,
      detalle: {motivo: opciones.motivo || null, ...cambios},
    });
    return cambios;
  }

  /**
   * Recalcula, desde cero y en una transacción, los contadores del
   * Expediente (resumen y resumenSujetos) a partir de sus instancias
   * activas. Idempotente: corre al terminar la generación y sirve para
   * reparar contadores.
   * @param {string} expedienteId ID del Expediente.
   * @return {Promise<Object>} {resumen, resumenSujetos} escritos.
   */
  async recalcularResumen(expedienteId) {
    const expedienteRef = db.collection(expedienteRepository.COLLECTION)
        .doc(expedienteId);
    let contadores;
    await db.runTransaction(async (tx) => {
      const [expediente, snap] = await Promise.all([
        tx.get(expedienteRef),
        tx.get(expedienteRequerimientoRepository.queryPorExpediente(
            expedienteId, "activo",
        )),
      ]);
      if (!expediente.exists) {
        throw new AppError(404, "Expediente no encontrado.");
      }
      const instancias = snap.docs.map((d) => d.data());
      contadores = resumirInstancias(instancias);
      // La fecha de vencimiento más próxima viaja dentro de `resumen` (el
      // objeto se reescribe entero: el antiguo contador "vencidos" se va).
      Object.assign(contadores.resumen, resumirVencimientos(instancias));
      tx.update(expedienteRef, {
        resumen: contadores.resumen,
        resumenSujetos: contadores.resumenSujetos,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return contadores;
  }

  /**
   * Recalcula, en una transacción, resumen.fechaVencimientoMasProxima del
   * Expediente desde sus instancias activas (al retirar, reactivar o crear
   * instancias, y al cambiar "requiere vencimiento" en el catálogo).
   * @param {string} expedienteId ID del Expediente.
   * @return {Promise<Object>} {fechaVencimientoMasProxima}.
   */
  async recalcularVencimientos(expedienteId) {
    const expedienteRef = db.collection(expedienteRepository.COLLECTION)
        .doc(expedienteId);
    let vencimientos;
    await db.runTransaction(async (tx) => {
      const [expediente, snap] = await Promise.all([
        tx.get(expedienteRef),
        tx.get(expedienteRequerimientoRepository.queryPorExpediente(
            expedienteId, "activo",
        )),
      ]);
      if (!expediente.exists) return;
      vencimientos = resumirVencimientos(snap.docs.map((d) => d.data()));
      tx.update(expedienteRef, {
        "resumen.vencidos": FieldValue.delete(),
        "resumen.fechaVencimientoMasProxima":
            vencimientos.fechaVencimientoMasProxima,
      });
    });
    return vencimientos;
  }

  /**
   * Propaga a las instancias ACTIVAS de los Expedientes abiertos el cambio
   * de "requiere vencimiento" de un Requerimiento del catálogo (las demás
   * copias de la instancia siguen congeladas). Si deja de requerirlo, la
   * fecha que ya tenía se conserva (deja de ser obligatoria y no cuenta como
   * vencida). Recalcula los vencidos de cada Expediente.
   * Lotes de 400; los Expedientes cerrados no se tocan.
   * @param {string} requerimientoId ID del Requerimiento.
   * @param {boolean} requiereVencimiento Valor nuevo.
   * @return {Promise<{instancias: number, expedientes: number}>} Cambios.
   */
  async propagarRequiereVencimiento(requerimientoId, requiereVencimiento) {
    const coleccion = expedienteRequerimientoRepository.COLLECTION;
    const snap = await db.collection(coleccion)
        .where("requerimientoId", "==", requerimientoId)
        .where("estado", "==", "activo")
        .get();
    const expedienteIds =
        [...new Set(snap.docs.map((d) => d.data().expedienteId))];
    const expedientes = await Promise.all(
        expedienteIds.map((eid) => expedienteRepository.getById(eid)),
    );
    const abiertos = new Set(expedientes
        .filter((e) => e && e.estado !== "cerrado").map((e) => e.id));
    const aActualizar = snap.docs.filter((d) =>
      abiertos.has(d.data().expedienteId) &&
      Boolean(d.data().requiereVencimiento) !== requiereVencimiento);
    for (let i = 0; i < aActualizar.length; i += MAX_OPERACIONES_LOTE) {
      const batch = db.batch();
      aActualizar.slice(i, i + MAX_OPERACIONES_LOTE).forEach((d) => {
        batch.update(d.ref, {
          requiereVencimiento,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }
    const tocados = [...new Set(aActualizar.map((d) => d.data().expedienteId))];
    for (const expedienteId of tocados) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.recalcularVencimientos(expedienteId);
      } catch (err) {
        console.error(
            `Error al recalcular vencimientos del Expediente ${expedienteId}:`,
            err,
        );
      }
    }
    return {instancias: aActualizar.length, expedientes: tocados.length};
  }

  /**
   * Instancias de un Expediente, opcionalmente de un sujeto.
   * @param {string} expedienteId ID del Expediente (ya validado su alcance).
   * @param {{personaId: (string|undefined), recursoId: (string|undefined),
   *     empresa: (boolean|undefined), estado: (string|undefined)}} filtros
   *     Sujeto y estado ("activo" por defecto; "todos" para ambos).
   * @return {Promise<Object[]>} Instancias ordenadas.
   */
  async listarDeExpediente(expedienteId, filtros = {}) {
    const estado = filtros.estado === "todos" ? null :
      (filtros.estado || "activo");
    let instancias;
    if (filtros.personaId) {
      instancias = await expedienteRequerimientoRepository
          .listByExpedienteYSujeto(expedienteId,
              {tipoEntidad: "persona", sujetoId: filtros.personaId}, estado);
    } else if (filtros.recursoId) {
      instancias = await expedienteRequerimientoRepository
          .listByExpedienteYSujeto(expedienteId,
              {tipoEntidad: "recurso", sujetoId: filtros.recursoId}, estado);
    } else if (filtros.empresa) {
      instancias = await expedienteRequerimientoRepository
          .listByExpedienteYSujeto(expedienteId, {tipoEntidad: "empresa"},
              estado);
    } else {
      instancias = await expedienteRequerimientoRepository
          .listByExpediente(expedienteId, estado);
    }
    return this.ordenar(instancias).map((i) => this.publica(i));
  }

  /**
   * Instancias de un sujeto en todos sus Expedientes (fichas de Persona,
   * Maquinaria y Empresa), acotadas al Mandante del actor si corresponde.
   * @param {{personaId: (string|undefined), recursoId: (string|undefined),
   *     empresaId: (string|undefined), estado: (string|undefined)}} filtros
   *     Exactamente un sujeto; estado "activo" por defecto o "todos".
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Instancias.
   */
  async listarPorSujeto(filtros, actor) {
    const campos = ["personaId", "recursoId", "empresaId"]
        .filter((c) => filtros[c]);
    if (campos.length !== 1) {
      throw new AppError(
          400, "Indique exactamente uno: personaId, recursoId o empresaId.",
      );
    }
    const campo = campos[0];
    const mandanteId = ["mandante_admin", "mandante_lector"]
        .includes(actor.rol) ? actor.mandanteId : undefined;
    const instancias = await expedienteRequerimientoRepository.listBySujeto(
        {campo, valor: filtros[campo], mandanteId},
    );
    const estado = filtros.estado || "activo";
    return this.ordenar(instancias
        .filter((i) => estado === "todos" || i.estado === estado))
        .map((i) => this.publica(i));
  }

  /**
   * Orden estable: por orden de configuración y luego por nombre.
   * @param {Object[]} instancias Instancias.
   * @return {Object[]} Ordenadas.
   */
  ordenar(instancias) {
    const orden = (i) => (typeof i.orden === "number" ? i.orden : Infinity);
    return [...instancias].sort((a, b) => orden(a) - orden(b) ||
        (a.nombre || "").localeCompare(b.nombre || ""));
  }
}

module.exports = new ExpedienteRequerimientoService();
module.exports.GeneracionInterrumpida = GeneracionInterrumpida;
