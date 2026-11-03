import { extensionDe } from "./repositorioDocumental.js";

// Lectura de planillas en el navegador (.xlsx/.xlsm con exceljs, .xls antiguo con SheetJS, ambos por
// import dinámico, y .csv), para
// el visor (VistaPlanilla) y para buscar datos en su texto (textoDocumento). Solo lectura.

export const MAX_FILAS = 1000;
const MAX_COLUMNAS = 60;
const dos = (n) => String(n).padStart(2, "0");

// Texto de una celda de exceljs: fechas en dd/mm/aaaa, fórmulas con su resultado, texto enriquecido
// e hipervínculos como texto.
const textoCelda = (v) => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // exceljs entrega las fechas en UTC (sin zona): se leen tal cual.
    return `${dos(v.getUTCDate())}/${dos(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
  }
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return textoCelda(v.result);
    if (v.text !== undefined) return textoCelda(v.text);
    if (v.hyperlink) return String(v.hyperlink);
    if (v.error) return String(v.error);
    return "";
  }
  return String(v);
};

// CSV simple (separador "," o ";", comillas dobles).
const leerCsv = (texto) => {
  const primera = texto.split(/\r?\n/, 1)[0] || "";
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ";" : ",";
  const filas = [];
  let fila = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === "\"" && texto[i + 1] === "\"") { celda += "\""; i++; } else if (c === "\"") comillas = false; else celda += c;
    } else if (c === "\"") comillas = true;
    else if (c === sep) { fila.push(celda); celda = ""; } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda); filas.push(fila); fila = []; celda = "";
    } else celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
};

// Hojas del archivo: [{ nombre, filas: [[texto]], recortada }].
// Excel antiguo (.xls, formato binario): SheetJS. Celdas como texto, fechas en dd/mm/aaaa.
const leerXls = async (archivo) => {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(new Uint8Array(await archivo.arrayBuffer()), { type: "array", cellDates: true, dense: true });
  return libro.SheetNames.map((nombre) => {
    // Valores crudos: las fechas llegan como Date y se muestran en dd/mm/aaaa (el formato propio de la
    // celda suele ser el norteamericano).
    const filas = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, raw: true, defval: "", blankrows: false })
      .map((f) => f.map((v) => (v instanceof Date ? `${dos(v.getDate())}/${dos(v.getMonth() + 1)}/${v.getFullYear()}` : v)));
    const columnas = Math.min(Math.max(0, ...filas.map((f) => f.length)), MAX_COLUMNAS);
    return {
      nombre,
      filas: filas.slice(0, MAX_FILAS).map((f) => Array.from({ length: columnas }, (_, i) => String(f[i] ?? ""))),
      recortada: filas.length > MAX_FILAS,
    };
  });
};

export const leerPlanilla = async (archivo) => {
  if (extensionDe(archivo.name) === "csv") {
    const filas = leerCsv(await archivo.text());
    return [{ nombre: "CSV", filas: filas.slice(0, MAX_FILAS).map((f) => f.slice(0, MAX_COLUMNAS)), recortada: filas.length > MAX_FILAS }];
  }
  if (extensionDe(archivo.name) === "xls") return leerXls(archivo);
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  return libro.worksheets.map((hoja) => {
    const columnas = Math.min(hoja.columnCount || 0, MAX_COLUMNAS);
    const filas = [];
    let total = 0;
    hoja.eachRow({ includeEmpty: false }, (fila) => {
      total++;
      if (filas.length >= MAX_FILAS) return;
      filas.push(Array.from({ length: columnas }, (_, i) => textoCelda(fila.getCell(i + 1).value)));
    });
    return { nombre: hoja.name, filas, recortada: total > MAX_FILAS };
  });
};


// Texto de una planilla por líneas: una línea por celda con contenido, fila por fila y en todas las
// hojas (así una razón social y su RUT en celdas contiguas quedan en líneas adyacentes).
export const textoPlanilla = async (archivo) => (await leerPlanilla(archivo))
  .flatMap((hoja) => hoja.filas.flatMap((fila) => fila.map((c) => String(c || "").trim()).filter(Boolean)));
