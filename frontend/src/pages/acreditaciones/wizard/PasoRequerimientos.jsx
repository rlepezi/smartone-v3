import React, { useEffect, useState } from "react";
import { Building2, Users, Truck, ChevronDown, ChevronRight, X } from "lucide-react";
import { acreditacionService } from "../../../services/acreditacionService";
import { ErrorBanner } from "../../../components/shared/ErrorBanner";
import { formatFecha } from "../../../utils/fechas";

const BLOQUES = [
  { key: "empresa", label: "Empresa", icon: Building2 },
  { key: "personas", label: "Personas", icon: Users },
  { key: "maquinarias", label: "Maquinarias", icon: Truck },
];

// Lista documento a documento de una entidad: mismos datos (`requisitos`) que produjo el
// preview para los conteos, sin ninguna consulta ni cálculo adicional.
// Estado de cada requisito: "Por evaluar" (gris, lo normal al crear) o "Reutilizado · vence …"
// (verde); ámbar solo si la documentación reutilizada vence antes del término del proyecto.
const ListaRequisitos = ({ requisitos = [], fechaTermino = null }) => (
  requisitos.length === 0 ? (
    <p className="text-[11px] text-slate-400 italic">Sin requisitos para esta entidad.</p>
  ) : (
    <ul className="space-y-1">
      {requisitos.map((r) => (
        <li key={r.requerimientoId} className="flex items-center justify-between gap-3 text-[11px] bg-white border border-slate-100 rounded-lg px-2.5 py-1.5">
          <span className="font-medium text-slate-700" title={r.nombre}>{r.nombreCorto || r.nombre}</span>
          {r.estado !== "reutilizado" ? (
            <span className="font-semibold text-slate-400 whitespace-nowrap">Por evaluar</span>
          ) : fechaTermino && r.vigenteHasta && String(r.vigenteHasta).slice(0, 10) < String(fechaTermino).slice(0, 10) ? (
            <span className="font-bold text-amber-600 whitespace-nowrap" title={`Vence el ${formatFecha(r.vigenteHasta)}; el proyecto termina el ${formatFecha(fechaTermino)}`}>
              Reutilizado · vence {formatFecha(r.vigenteHasta)}, antes del término del proyecto
            </span>
          ) : (
            <span className="font-bold text-sage-dark whitespace-nowrap">
              Reutilizado · {r.vigenteHasta ? `vence ${formatFecha(r.vigenteHasta)}` : "sin vencimiento"}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
);

// Paso 5 del wizard "Nueva Acreditación": previsualiza, sin escribir nada, cuántos
// Requerimientos aplicarán para la Empresa + Perfil + selección de Personas/Maquinarias armada
// hasta el momento, y cuántos quedarán pre-cumplidos por reutilización documental — mismo motor y
// misma regla de vigencia que usa Reemplazar Acreditación (reutilizacionDocumentalService en el
// backend). Paso puramente informativo: el usuario solo avanza.
// `fechaTerminoProyecto`: si existe, la documentación reutilizada que vence antes se marca en ámbar.
export const PasoRequerimientos = ({ empresaId, perfilParticipacionId, fechaInicio, seleccion, empresaNombre, onCargado, fechaTerminoProyecto = null }) => {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandidas, setExpandidas] = useState(() => new Set());
  const [modal, setModal] = useState(null); // { titulo, entidades: [{ nombre, requisitos }] }

  useEffect(() => {
    if (!empresaId || !perfilParticipacionId || !fechaInicio) return;
    setLoading(true);
    setError(null);
    acreditacionService
      .previewNueva({
        empresaId,
        perfilParticipacionId,
        fechaInicio,
        seleccion: seleccion.map((s) => ({ tipo: s.tipo, id: s.id, perfilRecursoIds: s.perfilRecursoIds || [] })),
      })
      .then((data) => {
        setPreview(data);
        if (onCargado) onCargado(data);
      })
      .catch((err) => setError(err.message || "No se pudo calcular la previsualización."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, perfilParticipacionId, fechaInicio, seleccion]);

  const alternar = (clave) => {
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave); else next.add(clave);
      return next;
    });
  };

  // Entidades de cada bloque (Empresa = una sola; Personas/Maquinarias = las seleccionadas).
  const entidadesDe = (key) => {
    if (!preview) return [];
    if (key === "empresa") {
      return [{ clave: "empresa", nombre: empresaNombre || "Empresa", total: preview.empresa.total, reutilizables: preview.empresa.reutilizables, requisitos: preview.empresa.requisitos || [] }];
    }
    const tipo = key === "personas" ? "persona" : "maquinaria";
    return preview.detallePorEntidad
      .filter((d) => d.tipo === tipo)
      .map((d) => ({ clave: `${d.tipo}-${d.id}`, nombre: d.nombre, total: d.totalRequerimientos, reutilizables: d.reutilizables, requisitos: d.requisitos || [] }));
  };

  const filas = preview ? BLOQUES.flatMap(({ key, label }) => entidadesDe(key).map((e) => ({ ...e, bloque: label }))) : [];

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Requerimientos aplicables</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Calculados automáticamente para la Empresa, el Perfil elegido y las Personas/Maquinarias
          seleccionadas. Al crear el expediente lo normal es que estén por evaluar; los que tengan
          documentación vigente se reutilizan sin intervención manual.
        </p>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <p className="text-xs text-slate-400 py-8 text-center">Calculando...</p>
      ) : preview ? (
        <>
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1">
            <p className="text-base font-bold text-carbon-dark">
              {preview.total.total} {preview.total.total === 1 ? "requerimiento se generará" : "requerimientos se generarán"} en este expediente
            </p>
            <p className="text-xs text-slate-500">
              {preview.total.reutilizables} {preview.total.reutilizables === 1 ? "cubierto" : "cubiertos"} por documentación vigente
              {" · "}{preview.total.total - preview.total.reutilizables} por evaluar
            </p>
            {preview.total.reutilizables > 0 && (
              <p className="text-xs font-bold text-sage-dark">
                {Math.round((preview.total.reutilizables / preview.total.total) * 100)}% se reutilizará
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {BLOQUES.map(({ key, label, icon: Icon }) => {
              const bloque = preview[key];
              if (!bloque || bloque.total === 0) {
                return (
                  <div key={key} className="p-4 rounded-xl border border-slate-100 bg-white text-center">
                    <Icon className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                    <p className="text-xs font-bold text-slate-400">{label}</p>
                    <p className="text-[11px] text-slate-400 mt-1">Sin Requerimientos</p>
                  </div>
                );
              }
              return (
                <div key={key} className="p-4 rounded-xl border border-slate-100 bg-white">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4 text-primary" />
                    <p className="text-xs font-bold text-carbon-dark">{label}</p>
                  </div>
                  <p className="text-xs text-slate-500">
                    {bloque.total} {bloque.total === 1 ? "requerimiento" : "requerimientos"} · {bloque.total - bloque.reutilizables} por evaluar
                  </p>
                  {bloque.reutilizables > 0 && (
                    <p className="mt-1 text-[11px] font-bold text-sage-dark">{bloque.reutilizables} reutilizados</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setModal({ titulo: `Requisitos — ${label}`, entidades: entidadesDe(key) })}
                    className="mt-2 text-[11px] font-bold text-primary hover:text-primary-dark"
                  >
                    Ver requisitos →
                  </button>
                </div>
              );
            })}
          </div>

          {filas.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Detalle de requisitos por entidad</p>
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-8" />
                      <th className="py-2.5 px-3">Entidad</th>
                      <th className="py-2.5 px-3">Reutilizados</th>
                      <th className="py-2.5 px-3">Por evaluar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filas.map((f) => {
                      const abierta = expandidas.has(f.clave);
                      return (
                        <React.Fragment key={f.clave}>
                          <tr className="hover:bg-slate-50/60 cursor-pointer" onClick={() => alternar(f.clave)}>
                            <td className="py-2.5 px-3 text-slate-400">
                              {abierta ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </td>
                            <td className="py-2.5 px-3">
                              <p className="font-semibold text-carbon-dark">{f.nombre}</p>
                              <p className="text-[10px] text-slate-400">{f.bloque}</p>
                            </td>
                            <td className={`py-2.5 px-3 ${f.reutilizables > 0 ? "font-bold text-sage-dark" : "text-slate-400"}`}>{f.reutilizables} de {f.total}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-500">{f.total - f.reutilizables}</td>
                          </tr>
                          {abierta && (
                            <tr className="bg-slate-50/50">
                              <td colSpan={4} className="px-4 py-3">
                                <ListaRequisitos requisitos={f.requisitos} fechaTermino={fechaTerminoProyecto} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-slate-400 py-8 text-center">
          No se pudo determinar el Perfil de Participación para calcular la previsualización.
        </p>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-dropdown w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">{modal.titulo}</h3>
              <button type="button" onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {modal.entidades.map((e) => (
                <div key={e.clave} className="space-y-1.5">
                  {modal.entidades.length > 1 && <p className="text-xs font-bold text-carbon-dark">{e.nombre}</p>}
                  <ListaRequisitos requisitos={e.requisitos} fechaTermino={fechaTerminoProyecto} />
                </div>
              ))}
              {modal.entidades.length === 0 && <p className="text-xs text-slate-400">Sin entidades seleccionadas.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
