const {validarParametros, camposDe, ejecutar} = require("./verificaciones");

// Armado de la llamada única al modelo (extraer los campos del tipo y juzgar
// las reglas interpretativas) y aplicación de las reglas. Funciones PURAS.
//
// Las reglas interpretativas viajan al modelo con un código corto (R1, R2…)
// y se traducen de vuelta al ID real. El contexto del sujeto (RUT, nombre…)
// NO se envía al modelo: así no puede copiarlo en los campos extraídos y las
// verificaciones de identidad comparan solo lo que dice el documento.

const RESULTADOS_INTERPRETATIVA = ["cumple", "no_cumple", "no_determinable"];

const PROMPT_SISTEMA = [
  "Eres un revisor de documentos de acreditación laboral en Chile.",
  "Recibes uno o más archivos que pertenecen al MISMO documento (por " +
    "ejemplo, anverso y reverso) y respondes solo con el JSON pedido.",
  "Extracción: copia cada campo tal como aparece; si no aparece o no se " +
    "lee, valor null. Fechas en formato AAAA-MM-DD. RUT con guion y dígito " +
    "verificador, sin puntos. No inventes ni completes datos.",
  "confianza: número de 0 a 1 según qué tan seguro estás de la lectura o " +
    "del juicio (1 = totalmente seguro).",
  "Reglas: evalúa cada instrucción solo con lo que muestran los archivos. " +
    "resultado cumple, no_cumple o no_determinable (si los archivos no " +
    "permiten decidir). justificacion: una o dos frases en español.",
].join("\n");

const NULABLE_TEXTO = {anyOf: [{type: "string"}, {type: "null"}]};

/**
 * Códigos cortos para las reglas interpretativas.
 * @param {Array<Object>} interpretativas Snapshot de reglas interpretativas.
 * @return {Map<string, Object>} código → regla.
 */
function codigos(interpretativas) {
  return new Map(interpretativas.map((r, i) => [`R${i + 1}`, r]));
}

/**
 * Esquema JSON de la respuesta.
 * @param {Array<{clave: string}>} campos Campos del tipo.
 * @param {Array<Object>} interpretativas Reglas interpretativas.
 * @return {Object} Esquema.
 */
function esquemaRespuesta(campos, interpretativas) {
  const propiedades = {};
  campos.forEach((c) => {
    propiedades[c.clave] = {
      type: "object",
      properties: {valor: NULABLE_TEXTO, confianza: {type: "number"}},
      required: ["valor", "confianza"], additionalProperties: false,
    };
  });
  const ids = [...codigos(interpretativas).keys()];
  return {
    type: "object",
    properties: {
      camposExtraidos: {
        type: "object", properties: propiedades,
        required: campos.map((c) => c.clave), additionalProperties: false,
      },
      interpretativas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            reglaId: ids.length ? {type: "string", enum: ids} :
              {type: "string"},
            resultado: {type: "string", enum: RESULTADOS_INTERPRETATIVA},
            confianza: {type: "number"},
            justificacion: {type: "string"},
          },
          required: ["reglaId", "resultado", "confianza", "justificacion"],
          additionalProperties: false,
        },
      },
    },
    required: ["camposExtraidos", "interpretativas"],
    additionalProperties: false,
  };
}

/**
 * Texto del pedido (va después de los archivos).
 * @param {Object} tipo Tipo documental ({nombre}).
 * @param {Array<Object>} campos Campos del tipo.
 * @param {Array<Object>} interpretativas Reglas interpretativas.
 * @return {string} Texto.
 */
function textoPedido(tipo, campos, interpretativas) {
  const lineas = [
    `Documento esperado: ${tipo.nombre}.`,
    "",
    "Campos a extraer (clave: descripción, tipo):",
    ...campos.map((c) => `- ${c.clave}: ${c.etiqueta} (${c.tipo})`),
    "",
  ];
  const cods = [...codigos(interpretativas)];
  if (cods.length) {
    lineas.push("Reglas a evaluar (una entrada por regla en " +
        "\"interpretativas\"):");
    cods.forEach(([cod, r]) => lineas.push(`- ${cod}: ${r.instruccionIA}`));
  } else {
    lineas.push("No hay reglas que evaluar: \"interpretativas\" va vacío.");
  }
  return lineas.join("\n");
}

const confianzaValida = (x) => typeof x === "number" && Number.isFinite(x);
const acotar = (x) => Math.min(Math.max(x, 0), 1);

/**
 * Valida y normaliza la respuesta del modelo.
 * @param {*} datos JSON recibido.
 * @param {Array<Object>} campos Campos del tipo.
 * @param {Array<Object>} interpretativas Reglas interpretativas.
 * @return {{ok: boolean, error: ?string, valor: ?{camposExtraidos: Object,
 *     interpretativas: Array<Object>}}} Resultado (interpretativas con el
 *     reglaId real).
 */
function validarRespuesta(datos, campos, interpretativas) {
  const error = (mensaje) => ({ok: false, error: mensaje, valor: null});
  if (!datos || typeof datos !== "object") return error("Respuesta vacía.");
  const extraidos = datos.camposExtraidos;
  if (!extraidos || typeof extraidos !== "object") {
    return error("Faltan los campos extraídos.");
  }
  const camposExtraidos = {};
  for (const c of campos) {
    const v = extraidos[c.clave];
    if (!v || typeof v !== "object" || !("valor" in v) ||
        !confianzaValida(v.confianza)) {
      return error(`Campo ${c.clave} incompleto.`);
    }
    const valor = v.valor === null || v.valor === undefined ||
      String(v.valor).trim() === "" ? null : String(v.valor).trim();
    camposExtraidos[c.clave] = {valor, confianza: acotar(v.confianza)};
  }
  const cods = codigos(interpretativas);
  const lista = Array.isArray(datos.interpretativas) ?
    datos.interpretativas : null;
  if (!lista) return error("Faltan las reglas interpretativas.");
  const vistas = new Map();
  for (const r of lista) {
    const regla = cods.get(r?.reglaId);
    if (!regla || vistas.has(r.reglaId)) continue;
    if (!RESULTADOS_INTERPRETATIVA.includes(r.resultado) ||
        !confianzaValida(r.confianza)) {
      return error(`Regla ${r.reglaId} incompleta.`);
    }
    vistas.set(r.reglaId, {
      reglaId: regla.reglaId, resultado: r.resultado,
      confianza: acotar(r.confianza),
      justificacion: String(r.justificacion || "").slice(0, 1000),
    });
  }
  const faltan = [...cods.keys()].filter((k) => !vistas.has(k));
  if (faltan.length) return error(`Faltan reglas: ${faltan.join(", ")}.`);
  return {ok: true, error: null,
    valor: {camposExtraidos, interpretativas: [...vistas.values()]}};
}

/**
 * Regla tal como se aplica en este requerimiento (versión vigente de la
 * biblioteca + severidad y parámetros del vínculo).
 * @param {Object} vinculo Vínculo requerimiento ↔ regla.
 * @param {Object} regla Regla de la biblioteca.
 * @return {Object} Snapshot (con `error` si los parámetros no validan).
 */
function snapshotRegla(vinculo, regla) {
  const base = {
    vinculoId: vinculo.id, reglaId: regla.id, nombre: regla.nombre,
    version: regla.version, tipo: regla.tipo, severidad: vinculo.severidad,
    orden: vinculo.orden, verificacion: regla.verificacion || null,
    instruccionIA: regla.instruccionIA || null,
  };
  if (regla.tipo !== "deterministica") {
    return {...base, parametros: {},
      camposRequeridos: [...(regla.camposRequeridos || [])]};
  }
  const p = validarParametros(regla.verificacion,
      {...(regla.parametros || {}), ...(vinculo.parametros || {})});
  return {...base, parametros: p.ok ? p.valor : {},
    camposRequeridos: p.ok ? camposDe(regla.verificacion, p.valor) :
      [...(regla.camposRequeridos || [])],
    ...(p.ok ? {} : {error: p.error})};
}

/**
 * Aplica las reglas: las determinísticas con el código y las
 * interpretativas con lo que respondió el modelo.
 * @param {Array<Object>} snapshot Reglas (snapshotRegla).
 * @param {Object} camposExtraidos {clave: {valor, confianza}}.
 * @param {Array<Object>} interpretativas Respuesta validada.
 * @param {Object} contexto Contexto de la prueba.
 * @return {Array<Object>} Resultado por regla.
 */
function aplicarReglas(snapshot, camposExtraidos, interpretativas, contexto) {
  const porRegla = new Map((interpretativas || [])
      .map((r) => [r.reglaId, r]));
  return snapshot.map((r) => {
    const base = {vinculoId: r.vinculoId, reglaId: r.reglaId,
      nombre: r.nombre, version: r.version, tipo: r.tipo,
      severidad: r.severidad};
    if (r.tipo === "deterministica") {
      if (r.error) {
        return {...base, resultado: "no_determinable", confianza: null,
          detalle: r.error};
      }
      const v = ejecutar(r.verificacion, camposExtraidos, contexto,
          r.parametros);
      return {...base, resultado: v.resultado, confianza: null,
        detalle: v.detalle};
    }
    const i = porRegla.get(r.reglaId);
    return i ?
      {...base, resultado: i.resultado, confianza: i.confianza,
        detalle: i.justificacion} :
      {...base, resultado: "no_determinable", confianza: null,
        detalle: "El modelo no evaluó la regla."};
  });
}

module.exports = {
  PROMPT_SISTEMA, esquemaRespuesta, textoPedido, validarRespuesta,
  snapshotRegla, aplicarReglas,
};
