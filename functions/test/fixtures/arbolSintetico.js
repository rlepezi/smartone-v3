// Árbol de carpetas SINTÉTICO (nombres inventados) con la forma de una
// carpeta de arranque real: repositorio con empresas numeradas, secciones
// con numeración distinta entre empresas y archivos con prefijos repetidos.

const archivo = (ruta, tamanoBytes = 1000) => ({
  nombre: ruta.split("/").pop(), ruta, tamanoBytes,
});

const carpeta = (ruta, carpetas = [], archivos = []) => ({
  nombre: ruta.split("/").pop(), ruta, carpetas,
  archivos: archivos.map((n) => archivo(`${ruta}/${n}`)),
});

const persona = (ruta) => carpeta(ruta, [], [
  "1.- ANEXO CONTRATO DE TRABAJO_Juan Perez.pdf",
  "1.- CONTRATO DE TRABAJO_Juan Perez.pdf",
  "2.- C.I. Juan Perez 31-12-2031.pdf",
  "3.- CERT. ANTECEDENTES Juan Perez.pdf",
  "4.- EPP Juan Perez.pdf",
  "5.- ODI Juan Perez 29-06-2022.pdf",
  "5.- ODI Juan Perez 2024.pdf",
  "5.- ODI_Juan Perez.pdf",
  "6.- RHIOS Juan Perez 07-07-2023.pdf",
  "7.- EX. OCUPACIONAL Juan Perez.pdf",
  "8.-PSICOSENSOTECNICO Juan Perez.pdf",
  "9.- EXAMEN DROGAS Juan Perez.pdf",
  "12.-Certificado de competencia laboral Juan Perez.pdf",
  "12.-CERTIFICADO DE TITULO Juan Perez.pdf",
  "foto sin nombre.pdf",
]);

const empresaA = carpeta("1. ALFA", [
  carpeta("1. ALFA/00. Revisión Carpeta de arranque"),
  carpeta("1. ALFA/01. Cronograma de actividades", [], ["carta.xlsx"]),
  carpeta("1. ALFA/02. Carpeta de trabajadores",
      [persona("1. ALFA/02. Carpeta de trabajadores/Juan Perez")],
      ["Listado Trabajadores.docx"]),
  carpeta("1. ALFA/03. Certificado de Mutualidad", [], ["mutual.pdf"]),
  carpeta("1. ALFA/04. Listado y antecedentes de conductores", [
    carpeta("1. ALFA/04. Listado y antecedentes de conductores/Juan Perez",
        [], ["Licencia Juan Perez.pdf", "Hoja de vida conductor.pdf"]),
  ]),
  carpeta("1. ALFA/09. MIPER (Matriz de Riesgos)", [], ["miper.xlsx"]),
  carpeta("1. ALFA/99. Fotos del asado"),
]);

const empresaB = carpeta("17.B-BETA_Proyecto_Linea_1x220_Norte", [
  carpeta("17.B-BETA_Proyecto_Linea_1x220_Norte/03. Carpetas Personales"),
  carpeta("17.B-BETA_Proyecto_Linea_1x220_Norte/04. Certificados Mutualidad",
      [], ["ist.pdf"]),
  carpeta("17.B-BETA_Proyecto_Linea_1x220_Norte/09. Matriz IPER", [],
      ["iper.pdf"]),
]);

const empresaC = carpeta("21. GAMA (Proyectos 2024)", [
  carpeta("21. GAMA (Proyectos 2024)/02. Carpeta de trabajadores"),
  carpeta("21. GAMA (Proyectos 2024)/03. Mutualidad", [], ["achs.pdf"]),
  carpeta("21. GAMA (Proyectos 2024)/06. Procedimientos de trabajo", [],
      ["p1.pdf"]),
]);

const repositorio = {nombre: "Repositorio", ruta: "",
  carpetas: [empresaA, empresaB, empresaC], archivos: []};

module.exports = {repositorio, empresaA, carpeta, archivo};
