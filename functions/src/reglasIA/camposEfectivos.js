// Campos que la IA debe extraer al revisar un requerimiento. El tipo
// documental es OPCIONAL: los campos salen de las reglas aplicadas (sus
// camposRequeridos) y, si el requerimiento tiene tipo, se suman los del tipo.
// Siempre se pide el título del documento, para que la IA tenga algo que leer
// aunque las reglas no pidan campos (p. ej. "Validar existencia del archivo").

const TITULO = {clave: "titulo", etiqueta: "Título del documento",
  tipo: "texto"};

// Claves conocidas con su descripción y tipo; las demás van como texto.
const CONOCIDOS = {
  titulo: TITULO,
  rut: {clave: "rut", etiqueta: "RUT", tipo: "rut"},
  nombre: {clave: "nombre", etiqueta: "Nombre", tipo: "texto"},
  patente: {clave: "patente", etiqueta: "Patente", tipo: "patente"},
  rutEmpleador: {clave: "rutEmpleador", etiqueta: "RUT del empleador",
    tipo: "rut"},
  razonSocial: {clave: "razonSocial", etiqueta: "Razón social",
    tipo: "texto"},
  fechaEmision: {clave: "fechaEmision", etiqueta: "Fecha de emisión",
    tipo: "fecha"},
  fechaVencimiento: {clave: "fechaVencimiento",
    etiqueta: "Fecha de vencimiento", tipo: "fecha"},
  clases: {clave: "clases", etiqueta: "Clases de la licencia", tipo: "texto"},
};

/**
 * Campo para una clave.
 * @param {string} clave Clave.
 * @return {{clave: string, etiqueta: string, tipo: string}} Campo.
 */
function campoDe(clave) {
  return {...(CONOCIDOS[clave] || {clave, etiqueta: clave, tipo: "texto"})};
}

/**
 * Campos a extraer: los del tipo (si hay) y los que piden las reglas, sin
 * repetir clave, con el título del documento siempre.
 * @param {?Object} tipo Tipo documental ({campos}) o null.
 * @param {Array<Object>} snapshot Reglas aplicadas ({camposRequeridos}).
 * @return {Array<Object>} Campos [{clave, etiqueta, tipo}].
 */
function camposEfectivos(tipo, snapshot) {
  const porClave = new Map();
  (tipo?.campos || []).forEach((c) => {
    if (c?.clave && !porClave.has(c.clave)) porClave.set(c.clave, {...c});
  });
  (snapshot || []).forEach((r) => (r.camposRequeridos || []).forEach((k) => {
    if (k && !porClave.has(k)) porClave.set(k, campoDe(k));
  }));
  if (!porClave.has(TITULO.clave)) porClave.set(TITULO.clave, {...TITULO});
  return [...porClave.values()];
}

module.exports = {camposEfectivos, campoDe};
