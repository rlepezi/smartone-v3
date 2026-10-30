/**
 * Crea en el disco una carpeta "Repositorio Empresas" de PRUEBA para usar como
 * fuente local en QA o en los emuladores (no usa Firebase). Todo es
 * sintético: las empresas son las de seedDatosPrueba.js (para que la carpeta
 * valide contra la Empresa) y los PDF solo dicen "Documento de prueba".
 *
 * Trae variantes para probar el Mapeo documental: prefijos de orden, siglas
 * con puntos (O.D.I), carpetas de personal y de maquinarias, archivos sueltos
 * y dos empresas con estructura parecida (copiar mapeo).
 *
 * Uso (desde functions/):
 *   node src/scripts/crearCarpetasPrueba.js "C:/QA/Repositorio Empresas"
 */
const fs = require("fs");
const path = require("path");

const PERSONAS = ["Ana Rojas Demo", "Pedro Soto Demo"];
const PATENTES = ["PRUE12", "DEMO34"];

// Estructura de cada empresa: rutas relativas (las que terminan en .pdf son
// archivos). {persona} y {patente} se repiten por cada una.
const COMPLETA = [
  "01. Certificado de Antecedentes/Certificado antecedentes empresa.pdf",
  "02. Poliza de Seguro/Poliza vigente 2026.pdf",
  "05. O.D.I Especifica del contrato/ODI firmada.pdf",
  "12. Reglamento interno de Higiene y seguridad (RIOHS)/RIOHS 2026.pdf",
  "10. Trabajadores/{persona}/1.- CONTRATO DE TRABAJO_{persona}.pdf",
  "10. Trabajadores/{persona}/2.- C.I. {persona} 31-12-2031.pdf",
  "10. Trabajadores/{persona}/3.- CERT. ANTECEDENTES {persona} 25-06-2026.pdf",
  "14. Vehiculos y Maquinarias/{patente}/Revision tecnica {patente}.pdf",
  "Listado de trabajadores.pdf",
];
const PARECIDA = [
  "1. Certificado de Antecedentes/Antecedentes.pdf",
  "2. Poliza de Seguro/Poliza.pdf",
  "5. ODI Especifica de contrato/ODI.pdf",
  "12. Reglamento interno (RIOHS)/Reglamento.pdf",
  "09. Personal/{persona}/CONTRATO DE TRABAJO_{persona}.pdf",
  "09. Personal/{persona}/C.I. {persona}.pdf",
  "13. Equipos/{patente}/Revision tecnica.pdf",
];
const DISTINTA = [
  "A - Documentos legales/Antecedentes laborales y previsionales.pdf",
  "B - Seguros/Seguro de accidentes.pdf",
  "C - Prevencion de riesgos/Charla ODI.pdf",
];
const EMPRESAS = [
  ["1. TRANSPORTES DEL VALLE", COMPLETA],
  ["2. INGENIERIA CORDILLERA", PARECIDA],
  ["3. SERVICIOS INDUSTRIALES MAULE", DISTINTA],
  ["4. LOGISTICA PUERTO SUR", []],
];

/**
 * PDF mínimo válido con una línea de texto.
 * @param {string} texto Texto.
 * @return {Buffer} PDF.
 */
function pdf(texto) {
  const limpio = texto.replace(/[()\\]/g, "");
  const contenido = `BT /F1 14 Tf 72 720 Td (${limpio}) Tj ET`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
      "/Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let salida = "%PDF-1.4\n";
  const offsets = objetos.map((o, i) => {
    const pos = salida.length;
    salida += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return pos;
  });
  const xref = salida.length;
  salida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xref}\n%%EOF\n`;
  return Buffer.from(salida, "latin1");
}

/**
 * Expande {persona} y {patente}.
 * @param {string} ruta Ruta con marcadores.
 * @return {string[]} Rutas.
 */
function expandir(ruta) {
  if (ruta.includes("{persona}")) {
    return PERSONAS.map((p) => ruta.split("{persona}").join(p));
  }
  if (ruta.includes("{patente}")) {
    return PATENTES.map((p) => ruta.split("{patente}").join(p));
  }
  return [ruta];
}

const destino = process.argv[2];
if (!destino) {
  console.error("Indique la carpeta destino, p. ej. " +
      "\"C:/QA/Repositorio Empresas\".");
  process.exit(1);
}
if (fs.existsSync(destino) && fs.readdirSync(destino).length) {
  console.error(`${destino} ya existe y no está vacía: elija otra.`);
  process.exit(1);
}
let archivos = 0;
for (const [carpeta, rutas] of EMPRESAS) {
  fs.mkdirSync(path.join(destino, carpeta), {recursive: true});
  rutas.flatMap(expandir).forEach((r) => {
    const completa = path.join(destino, carpeta, r);
    fs.mkdirSync(path.dirname(completa), {recursive: true});
    fs.writeFileSync(completa, pdf(`Documento de prueba: ${path.basename(r)}`));
    archivos++;
  });
}
console.log(`Listo: ${EMPRESAS.length} carpetas de empresa y ${archivos} ` +
    `archivos de prueba en ${destino}.`);
