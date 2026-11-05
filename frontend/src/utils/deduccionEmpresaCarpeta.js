// Deducción de la Empresa desde el nombre de su carpeta (Nueva Acreditación, paso Carpeta de la
// empresa). Funciones puras; se prueban desde Node en functions/test/deduccionEmpresaCarpeta.spec.js
// (por eso el import lleva la extensión ".js").
import { validarCarpetaEmpresa } from "./carpetaEmpresa.js";

// Nombre de la carpeta: el último tramo de su ruta ("Proyecto X/2. TECNORED" → "2. TECNORED").
export const nombreDeRuta = (ruta) => {
  const tramos = String(ruta || "").split("/").filter(Boolean);
  return tramos[tramos.length - 1] || "";
};

// Empresas cuyo nombre (razón social o nombre de fantasía, normalizados: sin tildes, mayúsculas,
// puntuación ni sufijo societario) o RUT está contenido en el nombre de la carpeta. Misma regla que
// la validación carpeta/empresa. Devuelve { tipo: "una" | "varias" | "ninguna", empresas }.
export const empresasDeCarpeta = (nombreCarpeta, empresas) => {
  const coincidentes = (empresas || []).filter((e) => validarCarpetaEmpresa(nombreCarpeta, e).valida);
  return {
    tipo: coincidentes.length === 1 ? "una" : coincidentes.length > 1 ? "varias" : "ninguna",
    empresas: coincidentes,
  };
};
