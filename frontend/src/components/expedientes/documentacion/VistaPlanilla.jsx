import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { extensionDe } from "../../../utils/repositorioDocumental";

const MAX_FILAS = 1000;
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
const leerPlanilla = async (archivo) => {
  if (extensionDe(archivo.name) === "csv") {
    const filas = leerCsv(await archivo.text());
    return [{ nombre: "CSV", filas: filas.slice(0, MAX_FILAS).map((f) => f.slice(0, MAX_COLUMNAS)), recortada: filas.length > MAX_FILAS }];
  }
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

// Vista previa de una planilla (.xlsx, .xlsm o .csv) en el visor: una pestaña por hoja, la primera
// fila como encabezado fijo y búsqueda que filtra filas. Solo lectura; nada se guarda.
export const VistaPlanilla = ({ archivo }) => {
  const [carga, setCarga] = useState({ archivo: null, hojas: null, error: null });
  const [hojaActiva, setHojaActiva] = useState(0);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    let vigente = true;
    leerPlanilla(archivo)
      .then((hojas) => { if (vigente) setCarga({ archivo, hojas, error: null }); })
      .catch(() => { if (vigente) setCarga({ archivo, hojas: null, error: "No se pudo leer la planilla. Ábrala en una pestaña nueva." }); });
    return () => { vigente = false; };
  }, [archivo]);

  const actual = carga.archivo === archivo ? carga : null;
  if (!actual) {
    return (
      <p className="m-auto flex items-center gap-2 text-xs text-slate-500">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-hidden="true" /> Abriendo planilla...
      </p>
    );
  }
  if (actual.error) return <p className="p-4 text-xs text-red-600">{actual.error}</p>;
  if (!actual.hojas.length) return <p className="p-4 text-xs text-slate-400">La planilla no tiene hojas.</p>;

  const hoja = actual.hojas[Math.min(hojaActiva, actual.hojas.length - 1)];
  const [encabezado = [], ...cuerpo] = hoja.filas;
  const columnas = Array.from({ length: Math.max(0, ...hoja.filas.map((f) => f.length)) }, (_, i) => i);
  const termino = filtro.trim().toLowerCase();
  const visibles = cuerpo.map((f, i) => ({ f, n: i + 2 }))
    .filter(({ f }) => !termino || f.some((c) => c.toLowerCase().includes(termino)));

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white">
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 border-b border-slate-100">
        {actual.hojas.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {actual.hojas.map((h, i) => (
              <button key={h.nombre} type="button" onClick={() => { setHojaActiva(i); setFiltro(""); }}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${i === hojaActiva ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                {h.nombre}
              </button>
            ))}
          </div>
        )}
        <label className="relative ml-auto">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar en la hoja" aria-label="Buscar en la hoja"
            className="pl-6 pr-2 py-1 w-44 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </label>
        <span className="text-[10px] text-slate-400 tabular-nums">{visibles.length} de {cuerpo.length} filas</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="text-[11px] border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-100">
              <th className="px-2 py-1 border border-slate-200 text-slate-400 font-normal">1</th>
              {columnas.map((i) => (
                <th key={i} className="px-2 py-1 border border-slate-200 text-left font-bold text-carbon-dark whitespace-nowrap">{encabezado[i] || ""}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map(({ f, n }) => (
              <tr key={n} className="hover:bg-primary-lighter/30">
                <td className="px-2 py-1 border border-slate-200 text-slate-400 bg-slate-50 tabular-nums">{n}</td>
                {columnas.map((i) => (
                  <td key={i} className="px-2 py-1 border border-slate-200 text-slate-700 whitespace-nowrap">{f[i] || ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {hoja.recortada && <p className="p-2 text-[10px] text-slate-400">Se muestran las primeras {MAX_FILAS} filas.</p>}
      </div>
    </div>
  );
};
