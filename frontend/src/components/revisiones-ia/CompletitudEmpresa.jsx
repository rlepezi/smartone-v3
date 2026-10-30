import { Download } from "lucide-react";
import { CLASE_BADGE, ESTADO_COMPLETITUD } from "../../utils/revisionIA";

// Documentos esperados por sección (de la plantilla); si la plantilla ya cambió, los que aparecen en
// los resultados.
const documentosDeSeccion = (seccion, filas) => {
  if (seccion) return seccion.documentos || [];
  const claves = new Map();
  filas.forEach((f) => {
    (f.documentosEncontrados || []).forEach((d) => claves.set(d.clave, { clave: d.clave, nombre: d.nombre }));
    (f.documentosFaltantes || []).forEach((c) => { if (!claves.has(c)) claves.set(c, { clave: c, nombre: c }); });
  });
  return [...claves.values()];
};

// Estado de un documento para una entidad: ✓, sensible, ✗ (obligatorio que falta), — (opcional) o
// "No incluido" (deshabilitado en la plantilla: no se revisa, no es un faltante).
const celda = (fila, doc) => {
  if (doc.habilitado === false || (fila.documentosIgnorados || []).some((d) => (d.clave || d) === doc.clave)) return "no_incluido";
  const encontrado = (fila.documentosEncontrados || []).find((d) => d.clave === doc.clave);
  if (encontrado) return encontrado.sensible ? "sensible" : "ok";
  return (fila.documentosFaltantes || []).includes(doc.clave) ? "falta" : "opcional";
};
const TEXTO_CELDA = { ok: "✓", sensible: "Sensible", falta: "✗", opcional: "—", no_incluido: "No incluido" };
const ESTADO_CSV = { ok: "Presente", sensible: "Revisión manual (dato sensible)", falta: "Falta", opcional: "No presentado (opcional)", no_incluido: "No incluido" };
const CLASE_CELDA = { ok: "text-sage-dark font-bold", sensible: "text-slate-500", falta: "text-red-600 font-bold", opcional: "text-slate-300", no_incluido: "text-slate-300 italic" };

const csv = (filas) => filas.map((f) => f.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");

// BOM para que Excel abra el CSV con tildes.
const BOM_UTF8 = "﻿";

const descargar = (nombre, contenido) => {
  const blob = new Blob([BOM_UTF8, contenido], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Pestaña "Completitud" de una empresa en el detalle de la sesión: tabla por sección y, por cada
// sección de entidades, tabla por persona con una columna por documento de la plantilla.
export const CompletitudEmpresa = ({ empresa, filas, plantilla }) => {
  const seccionPorClave = new Map((plantilla?.secciones || []).map((s) => [s.clave, s]));
  // Las secciones deshabilitadas van al final, plegadas.
  const filasSeccion = filas.filter((f) => !f.entidadCarpeta && f.estado !== "deshabilitada");
  const deshabilitadas = filas.filter((f) => !f.entidadCarpeta && f.estado === "deshabilitada");
  const porSeccion = new Map();
  filas.filter((f) => f.entidadCarpeta).forEach((f) => {
    if (!porSeccion.has(f.seccionClave)) porSeccion.set(f.seccionClave, []);
    porSeccion.get(f.seccionClave).push(f);
  });
  const nombreSeccion = (clave, carpeta) => seccionPorClave.get(clave)?.nombre || carpeta || clave || "—";

  const exportar = () => {
    const encabezado = ["Empresa", "Sección", "Carpeta", "Persona", "Documento", "Estado", "Archivos"];
    const filasCsv = [encabezado];
    filasSeccion.forEach((f) => filasCsv.push([empresa.nombreEmpresaDetectado, nombreSeccion(f.seccionClave, f.seccionCarpeta),
      f.seccionCarpeta, "", "", ESTADO_COMPLETITUD[f.estado]?.label || f.estado, f.encontrado]));
    porSeccion.forEach((entidades, clave) => {
      const docs = documentosDeSeccion(seccionPorClave.get(clave), entidades);
      entidades.forEach((f) => docs.forEach((d) => {
        const encontrado = (f.documentosEncontrados || []).find((x) => x.clave === d.clave);
        filasCsv.push([empresa.nombreEmpresaDetectado, nombreSeccion(clave), f.seccionCarpeta, f.entidadNombre, d.nombre,
          ESTADO_CSV[celda(f, d)], (encontrado?.archivos || []).join(" | ")]);
      }));
    });
    descargar(`completitud-${empresa.nombreEmpresaDetectado}.csv`, csv(filasCsv));
  };

  if (!filas.length) return <p className="py-6 text-center text-xs text-slate-400">Sin resultados de completitud para esta empresa.</p>;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button type="button" onClick={exportar} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-carbon-dark hover:bg-slate-50">
          <Download className="w-3.5 h-3.5" /> Exportar CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead>
            <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="px-3 py-2">Sección</th>
              <th className="px-3 py-2">Carpeta</th>
              <th className="px-3 py-2 text-right">Archivos / personas</th>
              <th className="px-3 py-2">Faltantes</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filasSeccion.map((f) => {
              const estado = ESTADO_COMPLETITUD[f.estado] || ESTADO_COMPLETITUD.no_aplica;
              return (
                <tr key={f.id || `${f.seccionClave}-${f.seccionCarpeta}`} className={f.estado === "no_reconocida" ? "text-slate-400" : ""}>
                  <td className="px-3 py-2 font-semibold">{f.seccionClave ? nombreSeccion(f.seccionClave) : "—"}</td>
                  <td className="px-3 py-2">{f.seccionCarpeta || "—"}</td>
                  <td className="px-3 py-2 text-right">{f.encontrado}</td>
                  <td className="px-3 py-2 text-slate-500">{(f.documentosFaltantes || []).join(", ") || "—"}</td>
                  <td className="px-3 py-2"><span className={`${CLASE_BADGE} ${estado.clase}`}>{estado.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {deshabilitadas.length > 0 && (
        <details className="rounded-xl border border-slate-100 [&_summary::-webkit-details-marker]:hidden">
          <summary className="px-4 py-2.5 cursor-pointer text-[11px] font-bold text-slate-500 select-none">
            No incluidas en esta revisión ({deshabilitadas.length})
          </summary>
          <ul className="px-4 pb-3 space-y-0.5 text-[11px] text-slate-400">
            {deshabilitadas.map((f) => (
              <li key={f.id || f.seccionClave}>{nombreSeccion(f.seccionClave, f.seccionCarpeta)}{f.seccionCarpeta ? ` · carpeta ${f.seccionCarpeta}` : ""}</li>
            ))}
          </ul>
        </details>
      )}

      {[...porSeccion.entries()].map(([clave, entidades]) => {
        const docs = documentosDeSeccion(seccionPorClave.get(clave), entidades);
        return (
          <div key={clave} className="space-y-1.5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{nombreSeccion(clave)} — por persona</p>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    <th className="px-3 py-2 font-bold sticky left-0 bg-slate-50">Persona</th>
                    {docs.map((d) => <th key={d.clave} className="px-2 py-2 font-semibold whitespace-nowrap text-center">{d.nombre}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entidades.map((f) => (
                    <tr key={f.id || f.entidadCarpeta}>
                      <td className="px-3 py-2 font-semibold text-carbon-dark whitespace-nowrap sticky left-0 bg-white">{f.entidadNombre || f.entidadCarpeta}</td>
                      {docs.map((d) => {
                        const c = celda(f, d);
                        return <td key={d.clave} className={`px-2 py-2 text-center ${CLASE_CELDA[c]}`} title={c === "sensible" ? "Revisión manual (dato sensible)" : undefined}>{TEXTO_CELDA[c]}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-400">
              <span className="text-sage-dark font-bold">✓</span> presente · <span className="text-red-600 font-bold">✗</span> faltante · <span className="italic">No incluido</span>: deshabilitado en la plantilla, no se revisa · — opcional no presentado
            </p>
          </div>
        );
      })}
    </div>
  );
};
