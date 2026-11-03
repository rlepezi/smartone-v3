/**
 * Crea, dentro de la carpeta raíz de la fuente documental local (p. ej.
 * "Repositorio Empresas"), carpetas de EMPRESAS FICTICIAS para probar "Nueva
 * Empresa desde carpeta" y "Nueva Acreditación". No usa Firebase ni toca
 * datos: solo escribe archivos en el disco.
 *
 * Cada empresa trae documentos con texto (RUT válido de persona jurídica y
 * razón social), para que el sistema los proponga:
 *   - 01. Cronograma de actividades/Cronograma.csv
 *   - 03. Certificado de Mutualidad/Certificado Mutualidad.pdf
 *   - 02. Carpeta de trabajadores/<persona>/... (con RUT de persona)
 *   - 05. Listado de Vehículos/Listado vehiculos.csv
 * Los RUT son ficticios pero con DV válido (rango 76.000.000–79.999.999).
 * Las carpetas que ya existen no se tocan.
 *
 * Uso (desde functions/):
 *   node src/scripts/crearEmpresasPrueba.js "C:/ruta/Repositorio Empresas"
 *   node src/scripts/crearEmpresasPrueba.js "C:/ruta/Repositorio Empresas" 10
 */
const fs = require("fs");
const path = require("path");

const NOMBRES = ["ALFA", "BETA", "GAMMA", "DELTA", "EPSILON", "ZETA", "ETA",
  "THETA", "IOTA", "KAPPA", "LAMBDA", "OMEGA"];
const RUBROS = [["CONSTRUCTORA", "SpA", "Construcción y obras civiles"],
  ["SERVICIOS", "LTDA.", "Servicios de mantención industrial"],
  ["INGENIERÍA", "S.A.", "Ingeniería eléctrica"],
  ["TRANSPORTES", "LIMITADA", "Transporte de carga por carretera"]];

/**
 * Dígito verificador de un RUT (módulo 11).
 * @param {number} cuerpo Cuerpo numérico.
 * @return {string} DV.
 */
function dv(cuerpo) {
  let suma = 0;
  let mult = 2;
  for (const d of String(cuerpo).split("").reverse()) {
    suma += Number(d) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}
const conPuntos = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const rut = (cuerpo) => `${conPuntos(cuerpo)}-${dv(cuerpo)}`;

/**
 * PDF mínimo con varias líneas de texto (extraíble con pdf.js).
 * @param {string[]} lineas Líneas.
 * @return {Buffer} PDF.
 */
function pdf(lineas) {
  const limpio = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[()\\]/g, "");
  const cuerpo = ["BT /F1 12 Tf 60 740 Td 16 TL",
    ...lineas.map((l) => `(${limpio(l)}) Tj T*`), "ET"].join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
      "/Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${cuerpo.length} >>\nstream\n${cuerpo}\nendstream`,
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

const raiz = process.argv[2];
const cantidad = Math.min(Math.max(Number(process.argv[3]) || 6, 1), 48);
if (!raiz || !fs.existsSync(raiz)) {
  console.error("Indique la carpeta raíz de la fuente local (debe existir).");
  process.exit(1);
}
const existentes = new Set(fs.readdirSync(raiz).map((n) => n.toLowerCase()));
let creadas = 0;
for (let i = 0; i < cantidad; i++) {
  const [rubro, sufijo, giro] = RUBROS[i % RUBROS.length];
  const nombre = `${rubro} PRUEBA ${NOMBRES[i % NOMBRES.length]}` +
    `${i >= NOMBRES.length ? ` ${Math.floor(i / NOMBRES.length) + 1}` : ""}`;
  const carpeta = `${90 + i}. ${nombre}`;
  if (existentes.has(carpeta.toLowerCase())) {
    console.log(`  = ya existe: ${carpeta}`);
    continue;
  }
  // RUT determinístico por empresa (el mismo en cada ejecución).
  const rutEmpresa = rut(76000000 + ((i * 7919 + 1237) % 3999999));
  const razon = `${nombre} ${sufijo}`;
  const persona = `Ana Prueba ${NOMBRES[i % NOMBRES.length]}`;
  const rutPersona = rut(15000000 + i * 101);
  const archivos = {
    "01. Cronograma de actividades/Cronograma.csv":
      "Cronograma de actividades;;\nEmpresa;" + razon + ";" + rutEmpresa +
      "\nGiro;" + giro + ";\nActividad;Inicio;Término\n" +
      "Instalación de faena;01/11/2026;15/11/2026\n",
    "03. Certificado de Mutualidad/Certificado Mutualidad.pdf": pdf([
      "CERTIFICADO DE AFILIACION (DOCUMENTO DE PRUEBA)",
      `Razon social: ${razon}`, `RUT: ${rutEmpresa}`, `Giro: ${giro}`,
      "Se certifica que la empresa se encuentra afiliada.",
      `Representante: ${persona} ${rutPersona}`]),
    [`02. Carpeta de trabajadores/${persona}/1.- CONTRATO DE TRABAJO_` +
      `${persona}.pdf`]: pdf([`Contrato de trabajo de ${persona}`,
      `RUT trabajador: ${rutPersona}`, `Empleador: ${razon} ${rutEmpresa}`]),
    "05. Listado de Vehículos/Listado vehiculos.csv":
      "Patente;Tipo\nPRUE12;Camioneta\n",
  };
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const completa = path.join(raiz, carpeta, ruta);
    fs.mkdirSync(path.dirname(completa), {recursive: true});
    fs.writeFileSync(completa, contenido);
  }
  creadas++;
  console.log(`  ✓ ${carpeta}  ·  ${razon}  ·  RUT ${rutEmpresa}`);
}
console.log(`\nListo: ${creadas} carpetas de empresa de prueba en ${raiz}.`);
