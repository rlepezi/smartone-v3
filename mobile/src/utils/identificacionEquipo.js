// Identificador de un Equipo (Maquinaria). Mismo criterio que
// functions/src/utils/identificacionRecurso.js: el campo `patente` guarda la
// patente (tipoIdentificacion "patente") o el N° de serie / código interno
// ("serie"). Las maquinarias anteriores a ese campo no traen tipo.

// Placas chilenas sin separadores: autos AA1111 / BBBB11, motos AA111 / BBB11.
const FORMATOS_PATENTE = [/^[A-Z]{2}\d{4}$/, /^[A-Z]{4}\d{2}$/, /^[A-Z]{2}\d{3}$/, /^[A-Z]{3}\d{2}$/];

export const normalizarPatente = (valor) => String(valor || "").toUpperCase().replace(/[\s.\-·]/g, "");

export const esPatenteChilena = (valor) => FORMATOS_PATENTE.some((re) => re.test(normalizarPatente(valor)));

// "BBCC12" -> "BBCC-12"; "AB1234" -> "AB-1234".
export const formatearPatente = (valor) => {
  const p = normalizarPatente(valor);
  const m = p.match(/^([A-Z]+)(\d+)$/);
  return m ? `${m[1]}-${m[2]}` : p;
};

// { tipo: "patente" | "serie" | "invalida" | "ninguno", valor }:
//  - patente válida (con tipo "patente" o sin tipo) → placa;
//  - tipo "serie" → N° de serie;
//  - con tipo "patente" o sin tipo y un texto que no es patente → aviso "Patente no válida".
export const identificadorEquipo = (recurso) => {
  const valor = String(recurso?.patente || "").trim();
  if (!valor) return { tipo: "ninguno", valor: null };
  if (recurso?.tipoIdentificacion === "serie") return { tipo: "serie", valor };
  if (esPatenteChilena(valor)) return { tipo: "patente", valor: formatearPatente(valor) };
  return { tipo: "invalida", valor };
};

// "Marca Modelo" (o el nombre, si no tiene marca ni modelo).
export const nombreEquipo = (recurso) => {
  const mm = [recurso?.marca, recurso?.modelo].filter(Boolean).join(" ").trim();
  return mm || recurso?.nombre || "Equipo";
};
