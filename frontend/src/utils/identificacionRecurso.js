// Identificación de una Maquinaria: "patente" (placa chilena) o "serie" (N° de serie o código
// interno). Mismo criterio que functions/src/utils/identificacionRecurso.js. Las maquinarias
// anteriores a este campo no tienen tipo (null) y no se asume ninguno.
export const OPCIONES_IDENTIFICACION = [
  { value: "patente", label: "Patente" },
  { value: "serie", label: "N° de serie / código interno" },
];

// Patente sin espacios, puntos ni guiones y en mayúsculas ("bb-cc 12" -> "BBCC12").
export const normalizarPatente = (valor) => String(valor || "").toUpperCase().replace(/[\s.\-·]/g, "");

// Autos AA1111 (antiguo) y BBBB11 (actual); motos AA111 (antiguo) y BBB11 (actual).
const FORMATOS_PATENTE = [/^[A-Z]{2}\d{4}$/, /^[A-Z]{4}\d{2}$/, /^[A-Z]{2}\d{3}$/, /^[A-Z]{3}\d{2}$/];
export const esPatenteChilena = (valor) => FORMATOS_PATENTE.some((re) => re.test(normalizarPatente(valor)));

// Error del campo, o null: tipo elegido, valor presente y, si es patente, con formato chileno.
export const errorIdentificacion = (tipo, valor) => {
  if (!tipo) return "Indique si es una patente o un N° de serie / código interno.";
  if (!String(valor || "").trim()) return tipo === "patente" ? "La patente es obligatoria." : "El N° de serie / código interno es obligatorio.";
  if (tipo === "patente" && !esPatenteChilena(valor)) {
    return "La patente no tiene formato chileno (ej. BBCC12 o AB1234). Si no es una patente, elija «N° de serie / código interno».";
  }
  return null;
};
