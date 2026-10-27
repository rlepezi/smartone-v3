// Carpetas de personas y maquinarias dentro del repositorio documental: limpieza de nombres y cruce
// con la BD. Funciones PURAS (solo leen; detectar nunca escribe en la BD).
//
// Las carpetas de personas traen solo el nombre, en formatos inconsistentes: "ALONSO MUÑOZ",
// "Aravena Felipe", "0.1. MIGUEL TORRES BARAHONA", "11KATHERINE GOMEZ PASCAL", "18.PABLO ORTIZ".

// Palabras que resaltan (sin seleccionar) la carpeta del personal o de maquinarias en el selector.
export const PALABRAS_CLAVE_CARPETA = {
  persona: ["trabajador", "trabajadores", "personal", "personales", "persona", "personas"],
  recurso: ["vehiculo", "vehiculos", "maquinaria", "maquinarias", "equipo", "equipos", "recurso", "recursos"],
};
const PALABRAS_LISTADO = ["listado", "nomina"];

// Minúsculas, sin tildes (la ñ pasa a n), solo letras, números y espacios simples.
export const claveTexto = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Prefijo numérico de orden, aunque vaya pegado: "0.1. ", "0.2 ", "10. ", "18.", "11", "01 - ", "2_".
const RE_PREFIJO = /^\s*\d+(?:[.,]\d+)*\s*[.\-_)–]*\s*/;

const titulo = (palabra) => (palabra
  ? palabra.charAt(0).toLocaleUpperCase("es") + palabra.slice(1).toLocaleLowerCase("es")
  : palabra);

// { display: "Miguel Torres Barahona", clave: "miguel torres barahona" }.
export const limpiarNombreCarpeta = (nombre) => {
  const sinPrefijo = String(nombre || "").replace(RE_PREFIJO, "").replace(/\s+/g, " ").trim();
  return {
    display: sinPrefijo.split(" ").map(titulo).join(" "),
    clave: claveTexto(sinPrefijo),
  };
};

// Tokens que cuentan para el cruce: de 2 o más letras (las iniciales sueltas se ignoran).
const tokensCruce = (clave) => clave.split(" ").filter((t) => t.length >= 2 && !/^\d+$/.test(t));

// ¿La carpeta es de esta persona? Todos los tokens de la carpeta (de 2+ letras) deben estar en el
// nombre completo de la persona; el orden no importa ("Aravena Felipe" = Felipe Aravena).
export const coincideNombreCarpeta = (claveCarpeta, nombreCompleto) => {
  const deCarpeta = tokensCruce(claveCarpeta);
  if (!deCarpeta.length) return false;
  const dePersona = new Set(claveTexto(nombreCompleto).split(" "));
  return deCarpeta.every((t) => dePersona.has(t));
};

// Patente chilena en un texto: AAAA00 (nueva) o AA0000 (antigua), con o sin guiones o espacios
// entre grupos ("BBCD12", "BB-CD-12", "BB CD 12", "AB-1234", "AB 12 34").
export const detectarPatente = (texto) => {
  const t = String(texto || "").toUpperCase();
  const nueva = t.match(/\b([A-Z]{2})[\s-]?([A-Z]{2})[\s-]?(\d{2})\b/);
  if (nueva) return `${nueva[1]}${nueva[2]}${nueva[3]}`;
  const antigua = t.match(/\b([A-Z]{2})[\s-]?(\d{2})[\s-]?(\d{2})\b/);
  return antigua ? `${antigua[1]}${antigua[2]}${antigua[3]}` : null;
};
const normalizarPatente = (s) => String(s || "").replace(/[\s.\-_]/g, "").toUpperCase();

export const esCarpetaDestacada = (nombre, tipo) => {
  const tokens = claveTexto(nombre).split(" ");
  return (PALABRAS_CLAVE_CARPETA[tipo] || []).some((p) => tokens.includes(p));
};
export const esPosibleListado = (nombre) => PALABRAS_LISTADO.some((p) => claveTexto(nombre).includes(p));

// Nombre y apellidos para "Crear desde carpeta": con 3+ tokens los dos últimos son apellidos; con 2,
// el primero es el nombre y el segundo el apellido paterno.
export const separarNombreApellido = (display) => {
  const t = String(display || "").split(" ").filter(Boolean);
  if (t.length >= 3) return { nombre: t.slice(0, -2).join(" "), apellido: t.slice(-2).join(" ") };
  if (t.length === 2) return { nombre: t[0], apellido: t[1] };
  return { nombre: t[0] || "", apellido: "" };
};

const nombreCompleto = (p) => `${p.nombre || ""} ${p.apellido || ""}`.trim();

// ¿La carpeta es de este sujeto? Persona: por nombre. Recurso: por patente si la carpeta la trae;
// si no, por nombre.
export const carpetaEsDe = (carpeta, tipo, sujeto) => {
  const limpio = limpiarNombreCarpeta(carpeta.nombre);
  if (tipo === "persona") return coincideNombreCarpeta(limpio.clave, nombreCompleto(sujeto));
  const patente = detectarPatente(carpeta.nombre);
  if (patente) return normalizarPatente(sujeto.patente) === patente;
  return coincideNombreCarpeta(limpio.clave, sujeto.nombre);
};

// Clasifica cada subcarpeta contra los sujetos de la Empresa (`propios`) y los de otras empresas
// (`otros`):
//  - "sugerida": un solo sujeto de la Empresa coincide.
//  - "ambigua": más de uno.
//  - "otra_empresa": ninguno de la Empresa, pero sí de otra (solo informativo).
//  - "no_registrada": nadie coincide.
export const clasificarCarpetas = (carpetas, tipo, propios, otros = []) => carpetas.map((carpeta) => {
  const limpio = limpiarNombreCarpeta(carpeta.nombre);
  const patente = tipo === "recurso" ? detectarPatente(carpeta.nombre) : null;
  const candidatos = propios.filter((s) => carpetaEsDe(carpeta, tipo, s));
  if (candidatos.length === 1) return { carpeta, limpio, patente, estado: "sugerida", candidatos };
  if (candidatos.length > 1) return { carpeta, limpio, patente, estado: "ambigua", candidatos };
  const enOtra = otros.filter((s) => carpetaEsDe(carpeta, tipo, s));
  if (enOtra.length) return { carpeta, limpio, patente, estado: "otra_empresa", candidatos: enOtra };
  return { carpeta, limpio, patente, estado: "no_registrada", candidatos: [] };
});

// Carpeta única de un sujeto entre las detectadas, o null (ninguna o más de una).
export const carpetaUnicaDe = (carpetas, tipo, sujeto) => {
  const coinciden = carpetas.filter((c) => carpetaEsDe(c, tipo, sujeto));
  return coinciden.length === 1 ? coinciden[0] : null;
};
