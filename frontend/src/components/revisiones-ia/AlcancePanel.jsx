import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, ListChecks } from "lucide-react";
import { CLASE_BADGE, MODALIDAD, MOTIVO_MODALIDAD } from "../../utils/revisionIA";

const ESTADO_IA = { no_normalizado: "No normalizado", piloto: "Piloto", activo: "Activo" };
const ENTIDAD = { persona: "Persona", maquinaria: "Maquinaria" };

// Enlace que resuelve cada advertencia del alcance.
const enlaceAdvertencia = (a) => {
  if (a.codigo === "tipo_inactivo" || a.codigo === "tipo_sin_uso") return { to: "/configuracion/ia?tab=tipos", texto: "Ir a Tipos documentales" };
  return { to: "/configuracion/ia?tab=estructura", texto: "Ir a Estructura de carpetas" };
};

// Resumen en una línea: "1 de 15 secciones habilitadas · 1 documento habilitado · …".
export const ResumenAlcance = ({ resumen }) => (
  <span>
    {resumen.seccionesHabilitadas} de {resumen.seccionesTotales} secciones habilitadas · {resumen.documentosHabilitados}{" "}
    {resumen.documentosHabilitados === 1 ? "documento habilitado" : "documentos habilitados"} · {resumen.conValidacionIA} con validación IA ·{" "}
    {resumen.soloCompletitud} solo completitud · {resumen.sensibles} {resumen.sensibles === 1 ? "sensible" : "sensibles"}
  </span>
);

// Panel "Alcance de validación": qué documentos se tomarán en cuenta en la revisión, con su
// modalidad (Validación IA / Solo completitud / Sensible), tipo documental, reglas y advertencias.
// `compacto`: versión de solo lectura para Nueva revisión, con el enlace "Editar alcance".
export const AlcancePanel = ({ alcance, compacto = false, abierto = true, puedeEditar = false }) => {
  if (!alcance) return null;
  return (
    <details open={abierto} className="rounded-2xl border border-primary/20 bg-white [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex flex-wrap items-center gap-2 px-4 py-3 cursor-pointer select-none">
        <ListChecks className="w-4 h-4 text-primary" />
        <span className="text-sm font-bold text-carbon-dark">Alcance de validación</span>
        <span className="text-[11px] text-slate-500"><ResumenAlcance resumen={alcance.resumen} /></span>
        <span className="ml-auto flex items-center gap-3">
          {compacto && puedeEditar && (
            <Link to="/configuracion/ia?tab=estructura" onClick={(e) => e.stopPropagation()} className="text-[11px] font-bold text-primary hover:text-primary-dark">Editar alcance</Link>
          )}
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </span>
      </summary>
      <div className="px-4 pb-4 space-y-3">
        {alcance.advertencias.map((a) => {
          const enlace = enlaceAdvertencia(a);
          return (
            <p key={`${a.codigo}-${a.documentoClave || a.tipoCodigo || ""}`} className="flex flex-wrap items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span className="flex-1">{a.mensaje}</span>
              {!compacto || puedeEditar ? <Link to={enlace.to} className="font-bold underline">{enlace.texto}</Link> : null}
            </p>
          );
        })}
        {alcance.documentos.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">No hay documentos habilitados. Habilita al menos una sección y un documento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-3 py-2">Documento</th>
                  <th className="px-3 py-2">Sección</th>
                  <th className="px-3 py-2">Entidad</th>
                  <th className="px-3 py-2">Obligatorio</th>
                  <th className="px-3 py-2">Modalidad</th>
                  <th className="px-3 py-2">Tipo documental</th>
                  {!compacto && <th className="px-3 py-2">Reglas</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alcance.documentos.map((d) => {
                  const modalidad = MODALIDAD[d.modalidad] || MODALIDAD.solo_completitud;
                  return (
                    <tr key={`${d.seccionClave}-${d.documentoClave}`}>
                      <td className="px-3 py-2 font-semibold text-carbon-dark">{d.documentoNombre}{d.nivel === "archivoSeccion" && <span className="block text-[10px] font-normal text-slate-400">Archivo suelto de la sección</span>}</td>
                      <td className="px-3 py-2 text-slate-600">{d.seccionNombre}</td>
                      <td className="px-3 py-2 text-slate-600">{ENTIDAD[d.entidad] || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{d.obligatorio ? "Sí" : "No"}</td>
                      <td className="px-3 py-2">
                        <span className={`${CLASE_BADGE} ${modalidad.clase}`} title={d.motivoModalidad ? MOTIVO_MODALIDAD[d.motivoModalidad] : undefined}>{modalidad.label}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {d.tipoDocumental ? `${d.tipoDocumental.codigo} · ${d.tipoDocumental.estado === "activo" ? ESTADO_IA[d.tipoDocumental.estadoIA] || d.tipoDocumental.estadoIA : "Inactivo"}` : "—"}
                      </td>
                      {!compacto && (
                        <td className="px-3 py-2">
                          <span className="flex flex-wrap gap-1">
                            {d.reglas.map((r) => (
                              <span key={r.codigo} title={r.descripcion} className="px-1.5 py-0.5 rounded-full bg-primary-lighter text-primary-dark text-[10px] font-bold cursor-help">{r.codigo}</span>
                            ))}
                            {!d.reglas.length && <span className="text-slate-300">—</span>}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
};
