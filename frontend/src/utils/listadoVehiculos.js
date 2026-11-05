// Vehículos y equipos de un listado en planilla (Excel o CSV): descripción, placa patente (o N° de
// serie), marca y modelo, leídos de las filas bajo la fila de encabezado de cada hoja. Determinístico,
// sin IA. Funciones puras; se prueban desde Node en functions/test/listadoVehiculos.spec.js (por eso
// los imports llevan la extensión ".js").
import { esPatenteChilena, normalizarPatente } from "./identificacionRecurso.js";

const clave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Columnas reconocidas por su encabezado (normalizado).
const COLUMNAS = {
  patente: (k) => ["patente", "placa", "placa patente", "ppu", "n patente", "n de patente", "nro patente",
    "patente vehiculo", "placa unica", "matricula", "n placa"].includes(k) || k.startsWith("placa patente"),
  serie: (k) => ["n serie", "n de serie", "numero de serie", "nro serie", "serie", "n chasis", "chasis",
    "codigo interno", "n interno", "codigo"].includes(k),
  descripcion: (k) => ["descripcion", "descripcion vehiculo", "descripcion del vehiculo", "descripcion equipo",
    "descripcion del equipo", "tipo de vehiculo", "tipo vehiculo", "tipo de equipo", "tipo equipo", "tipo",
    "vehiculo", "equipo", "clase", "tipo de maquinaria"].includes(k),
  marca: (k) => k === "marca" || k.startsWith("marca "),
  modelo: (k) => k === "modelo" || k.startsWith("modelo "),
  anio: (k) => ["ano", "ano fabricacion", "ano de fabricacion", "anio"].includes(k),
};
const FILAS_BUSCAR_ENCABEZADO = 40;

// Columnas de una fila de encabezado, o null: necesita una de identificación (patente o serie) y una
// de descripción, marca o modelo (así un título combinado como «DESCRIPCIÓN VEHÍCULO» no cuenta).
const columnasDe = (fila) => {
  const col = {};
  fila.forEach((celda, i) => {
    const k = clave(celda);
    if (!k) return;
    Object.entries(COLUMNAS).forEach(([campo, es]) => {
      if (col[campo] === undefined && es(k)) col[campo] = i;
    });
  });
  const conId = col.patente !== undefined || col.serie !== undefined;
  const conDatos = col.descripcion !== undefined || col.marca !== undefined || col.modelo !== undefined;
  return conId && conDatos ? col : null;
};

// Caracteres invisibles que suelen venir pegados en las planillas (espacio de ancho cero, unión de
// palabras, guion suave, marca de orden de bytes): se quitan antes de leer la celda.
const RE_INVISIBLES = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
const limpio = (s) => String(s ?? "").replace(RE_INVISIBLES, "").replace(/\s+/g, " ").trim();

// Motivo concreto por el que una patente (ya normalizada) no tiene formato chileno, o null.
export const motivoPatenteInvalida = (patente) => {
  const p = String(patente || "");
  if (esPatenteChilena(p)) return null;
  const extrano = [...p].find((c) => !/[A-Z0-9]/.test(c));
  if (extrano) {
    const codigo = `U+${extrano.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
    return /\p{L}/u.test(extrano)
      ? `contiene «${extrano}» (${codigo}), una letra de otro alfabeto o con tilde que se ve como una latina; corríjala en la planilla`
      : `contiene un carácter que no es letra ni número (${codigo})`;
  }
  return `«${p}» tiene ${p.length} caracteres; se espera BBBB11 o AA1111 (autos), BBB11 o AA111 (motos)`;
};

// hojas: [{ nombre, filas: string[][] }] (leerPlanilla). Devuelve los vehículos de todas las hojas con
// encabezado reconocido: [{ hoja, fila, descripcion, patente, tipoIdentificacion ("patente" | "serie"),
// patenteValida, marca, modelo, anio, nombre (marca + modelo, o la descripción) }], sin repetir la
// identificación. Filas sin identificación ni datos se omiten.
export const vehiculosDeListado = (hojas) => {
  const vehiculos = [];
  const vistos = new Set();
  (hojas || []).forEach((hoja) => {
    const filas = hoja.filas || [];
    let inicio = -1;
    let col = null;
    for (let i = 0; i < Math.min(filas.length, FILAS_BUSCAR_ENCABEZADO); i++) {
      col = columnasDe(filas[i] || []);
      if (col) { inicio = i; break; }
    }
    if (inicio < 0) return;
    const celda = (fila, campo) => (col[campo] === undefined ? "" : limpio(fila[col[campo]]));
    for (let i = inicio + 1; i < filas.length; i++) {
      const fila = filas[i] || [];
      if (columnasDe(fila)) continue;
      const patenteCruda = celda(fila, "patente");
      const serie = celda(fila, "serie");
      const descripcion = celda(fila, "descripcion");
      const marca = celda(fila, "marca");
      const modelo = celda(fila, "modelo");
      const sinPatente = !patenteCruda || /^(no aplica|n a|na|s p|sin patente|-+)$/i.test(clave(patenteCruda) || patenteCruda);
      const tipoIdentificacion = !sinPatente ? "patente" : serie ? "serie" : null;
      const identificacion = tipoIdentificacion === "patente" ? normalizarPatente(patenteCruda)
        : tipoIdentificacion === "serie" ? serie : null;
      if (!identificacion && !descripcion && !marca && !modelo) continue;
      const llave = identificacion ? `${tipoIdentificacion}:${identificacion.toLowerCase()}` : null;
      if (llave && vistos.has(llave)) continue;
      if (llave) vistos.add(llave);
      const anio = Number(celda(fila, "anio")) || null;
      vehiculos.push({
        hoja: hoja.nombre || null, fila: i + 1,
        descripcion: descripcion || null, marca: marca || null, modelo: modelo || null,
        anio: anio && anio > 1900 && anio < 2200 ? anio : null,
        patente: identificacion, tipoIdentificacion,
        patenteValida: tipoIdentificacion === "patente" ? esPatenteChilena(identificacion) : tipoIdentificacion === "serie",
        motivoPatente: tipoIdentificacion === "patente" ? motivoPatenteInvalida(identificacion) : null,
        nombre: [marca, modelo].filter(Boolean).join(" ") || descripcion || identificacion || "",
      });
    }
  });
  return vehiculos;
};

// Maquinaria de SmartOne (de la empresa) que corresponde a una fila del listado: por su
// identificación (patente normalizada o N° de serie, sin distinguir mayúsculas).
export const registradoDe = (fila, recursos) => {
  if (!fila.patente) return null;
  const buscada = normalizarPatente(fila.patente);
  return recursos.find((r) => r.patente && normalizarPatente(r.patente) === buscada) || null;
};
