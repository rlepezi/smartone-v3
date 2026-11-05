// Personas de un listado del personal en planilla (Excel o CSV): nombre, RUT y cargo, leídos de las
// filas bajo la fila de encabezado. Determinístico, sin IA. Funciones puras; se prueban desde Node en
// functions/test/listadoPersonal.spec.js (por eso los imports llevan la extensión ".js").
import { cleanRut, validateRut } from "./rutFormatters.js";
import { claveTexto } from "./carpetasSujetos.js";

// Minúsculas, sin tildes, solo letras, números y espacios simples.
const clave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Columnas reconocidas por su encabezado (ya normalizado).
const COLUMNAS = {
  rut: (k) => /^(rut|run|r u t|r u n)\b/.test(k) || ["cedula", "cedula de identidad", "c i", "ci"].includes(k),
  nombreCompleto: (k) => ["nombre completo", "nombre y apellido", "nombre y apellidos", "nombres y apellidos",
    "apellidos y nombres", "apellido y nombre", "nombre trabajador", "nombre del trabajador", "trabajador",
    "nombre", "nombre colaborador", "colaborador"].includes(k),
  nombres: (k) => ["nombres", "nombre s", "primer nombre"].includes(k),
  apellidoPaterno: (k) => k.startsWith("apellido paterno") || k === "ap paterno",
  apellidoMaterno: (k) => k.startsWith("apellido materno") || k === "ap materno",
  apellidos: (k) => ["apellidos", "apellido"].includes(k),
  cargo: (k) => k.startsWith("cargo") || ["funcion", "puesto", "especialidad", "oficio", "rol"].includes(k),
};
const FILAS_BUSCAR_ENCABEZADO = 40;

const titulo = (s) => String(s || "").trim().split(/\s+/).filter(Boolean)
  .map((p) => p.charAt(0).toLocaleUpperCase("es") + p.slice(1).toLocaleLowerCase("es")).join(" ");

// Columnas de una fila de encabezado, o null si no lo es (necesita una de nombre y, para no
// confundirla con un título, al menos otra columna reconocida).
const columnasDe = (fila) => {
  const col = {};
  fila.forEach((celda, i) => {
    const k = clave(celda);
    if (!k) return;
    Object.entries(COLUMNAS).forEach(([campo, es]) => {
      if (col[campo] === undefined && es(k)) col[campo] = i;
    });
  });
  const conNombre = col.nombreCompleto !== undefined || col.nombres !== undefined;
  const reconocidas = Object.keys(col).length;
  return conNombre && reconocidas >= 2 ? col : null;
};

// "ARAVENA ESPINOZA, JAIME ENRIQUE" (apellidos, nombres) o "Jaime Enrique Aravena Espinoza"
// (nombres y dos apellidos al final) → { nombre, apellido }.
export const separarNombreCompleto = (texto) => {
  const limpio = String(texto || "").replace(/\s+/g, " ").trim();
  if (limpio.includes(",")) {
    const [apellidos, nombres] = limpio.split(",", 2);
    return { nombre: titulo(nombres), apellido: titulo(apellidos) };
  }
  const t = limpio.split(" ").filter(Boolean);
  if (t.length >= 3) return { nombre: titulo(t.slice(0, -2).join(" ")), apellido: titulo(t.slice(-2).join(" ")) };
  if (t.length === 2) return { nombre: titulo(t[0]), apellido: titulo(t[1]) };
  return { nombre: titulo(t[0] || ""), apellido: "" };
};

// hojas: [{ nombre, filas: string[][] }] (leerPlanilla). Devuelve las personas de todas las hojas
// con encabezado reconocido: [{ hoja, fila (1..n), nombre, apellido, nombreCompleto, rut (sin puntos
// ni guion, o null), rutValido, cargo }], sin repetir RUT. Filas sin nombre se omiten.
export const personasDeListado = (hojas) => {
  const personas = [];
  const ruts = new Set();
  (hojas || []).forEach((hoja) => {
    const filas = hoja.filas || [];
    let inicio = -1;
    let col = null;
    for (let i = 0; i < Math.min(filas.length, FILAS_BUSCAR_ENCABEZADO); i++) {
      col = columnasDe(filas[i] || []);
      if (col) { inicio = i; break; }
    }
    if (inicio < 0) return;
    const celda = (fila, campo) => (col[campo] === undefined ? "" : String(fila[col[campo]] ?? "").trim());
    for (let i = inicio + 1; i < filas.length; i++) {
      const fila = filas[i] || [];
      let { nombre, apellido } = col.nombreCompleto !== undefined
        ? separarNombreCompleto(celda(fila, "nombreCompleto")) : { nombre: titulo(celda(fila, "nombres")), apellido: "" };
      const apellidos = [celda(fila, "apellidoPaterno"), celda(fila, "apellidoMaterno")].filter(Boolean).join(" ")
        || celda(fila, "apellidos");
      if (apellidos) {
        if (col.nombreCompleto === undefined) apellido = titulo(apellidos);
      }
      if (!nombre && !apellido) continue;
      // Otra fila de encabezado (la tabla se repite): se salta.
      if (columnasDe(fila)) continue;
      const rutCrudo = celda(fila, "rut");
      const rutLimpio = rutCrudo ? cleanRut(rutCrudo) : "";
      const rutValido = Boolean(rutLimpio) && validateRut(rutLimpio);
      if (rutValido && ruts.has(rutLimpio)) continue;
      if (rutValido) ruts.add(rutLimpio);
      personas.push({
        hoja: hoja.nombre || null, fila: i + 1, nombre, apellido,
        nombreCompleto: `${nombre} ${apellido}`.trim(),
        rut: rutValido ? rutLimpio : null, rutValido, rutOriginal: rutCrudo || null,
        cargo: celda(fila, "cargo") || null,
      });
    }
  });
  return personas;
};

// Persona de SmartOne (de la empresa) que corresponde a una fila del listado: por RUT; sin RUT
// válido, por nombre completo exacto (normalizado).
export const registradaDe = (fila, personas) => personas.find((p) => fila.rut && cleanRut(p.rut || "") === fila.rut)
  || (!fila.rut ? personas.find((p) => claveTexto(`${p.nombre} ${p.apellido || ""}`) === claveTexto(fila.nombreCompleto)) : null)
  || null;

// ¿Es una planilla que se puede leer como listado?
export const esPlanillaListado = (nombre) => ["xlsx", "xlsm", "xls", "csv"].includes(String(nombre || "").split(".").pop().toLowerCase());
