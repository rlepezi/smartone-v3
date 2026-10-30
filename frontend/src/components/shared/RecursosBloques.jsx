import React, { useState } from "react";
import { PatenteChip } from "./PatenteChip";
import { Search } from "lucide-react";
import { EvaluacionCelda } from "./EvaluacionCelda";
import { Tabs } from "./Tabs";

const SUBTABS = [
  { key: "personas", label: "Personas" },
  { key: "maquinarias", label: "Maquinarias" },
];

const ETIQUETAS_ACREDITACION = {
  personas: { acreditada: "Acreditada", pendiente: "Pendiente", no_acreditada: "No Acreditada", sin_evaluar: "Sin Evaluar" },
  maquinarias: { acreditada: "Acreditado", pendiente: "En Proceso", no_acreditada: "No Acreditado", sin_evaluar: "Sin Evaluar" },
};

// Vista "Recursos" compartida (detalle de Proyecto y de Empresa): sub-pestañas
// Personas / Maquinarias, buscador, filtro de Estado de Acreditación y un
// bloque por agrupador (Empresa en el Proyecto, Proyecto en la Empresa).
//
// `construirBloques(subTab)` devuelve
//   [{ key, titulo, subtitulo, perfil, filas: [{ key, nombre, secundario,
//      clasificacion, evaluacion: {total, pctCumple, categoria} }] }]
// `estado`: "cargando" | "error" | "listo". `cabecera`: nodo opcional arriba.
// `accionFila(fila)` (opcional) agrega una columna de Acciones; solo se pasa en modo edición.
export const RecursosBloques = ({ cabecera, estado, construirBloques, mensajeSinBloques, accionFila }) => {
  const [subTab, setSubTab] = useState("personas");
  const [busqueda, setBusqueda] = useState("");
  const [filtroAcreditacion, setFiltroAcreditacion] = useState("");

  const cambiarSubTab = (key) => {
    setSubTab(key);
    setBusqueda("");
    setFiltroAcreditacion("");
  };

  const esPersonas = subTab === "personas";
  const term = busqueda.trim().toLowerCase();
  const hayFiltro = !!term || !!filtroAcreditacion;

  const bloques = estado === "listo"
    ? construirBloques(subTab)
        .map((b) => ({
          ...b,
          filas: b.filas.filter((f) => {
            const coincideTexto = !term
              || f.nombre.toLowerCase().includes(term)
              || (f.secundario || "").toLowerCase().includes(term);
            const coincideEstado = !filtroAcreditacion || f.evaluacion?.categoria === filtroAcreditacion;
            return coincideTexto && coincideEstado;
          }),
        }))
        .filter((b) => !hayFiltro || b.filas.length > 0)
    : [];

  return (
    <div className="space-y-6">
      {cabecera}

      <Tabs tabs={SUBTABS} active={subTab} onChange={cambiarSubTab} />

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={esPersonas ? "Buscar por nombre o RUT..." : "Buscar por nombre o patente..."}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
          />
        </div>
        <select
          value={filtroAcreditacion}
          onChange={(e) => setFiltroAcreditacion(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
        >
          <option value="">Estado de Acreditación: Todos</option>
          {Object.entries(ETIQUETAS_ACREDITACION[subTab]).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>{etiqueta}</option>
          ))}
        </select>
      </div>

      {estado === "cargando" ? (
        <p className="text-xs text-slate-400 py-6 text-center">Cargando...</p>
      ) : estado === "error" ? (
        <p className="text-xs text-red-600 py-6 text-center">No se pudieron cargar las evaluaciones.</p>
      ) : bloques.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">
          {hayFiltro ? "Nada coincide con el filtro." : mensajeSinBloques}
        </p>
      ) : (
        bloques.map((b) => (
          <div key={b.key} className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-carbon-dark">{b.titulo}</h3>
                <p className="text-[11px] text-slate-400">{b.subtitulo || "-"}</p>
              </div>
              {b.perfil && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold border bg-violet-50 text-violet-700 border-violet-200 whitespace-nowrap">
                  {b.perfil}
                </span>
              )}
            </div>

            {b.filas.length === 0 ? (
              <p className="px-6 py-4 text-xs text-slate-400">
                {esPersonas ? "Sin personas asignadas." : "Sin maquinarias asignadas."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] table-fixed text-left border-collapse text-xs">
                  <colgroup>
                    <col className={accionFila ? "w-[28%]" : "w-[34%]"} />
                    <col className={accionFila ? "w-[18%]" : "w-[22%]"} />
                    <col className={accionFila ? "w-[18%]" : "w-[22%]"} />
                    <col className={accionFila ? "w-[20%]" : "w-[22%]"} />
                    {accionFila && <col className="w-[16%]" />}
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-6">{esPersonas ? "Persona" : "Maquinaria"}</th>
                      <th className="py-2.5 px-6">{esPersonas ? "RUT" : "Identificación / Patente"}</th>
                      <th className="py-2.5 px-6">{esPersonas ? "Rol" : "Clasificación"}</th>
                      <th className="py-2.5 px-6">Evaluación</th>
                      {accionFila && <th className="py-2.5 px-6 text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {b.filas.map((f) => (
                      <tr key={f.key} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-6 font-bold text-carbon-dark">{f.nombre}</td>
                        <td className="py-3 px-6 font-mono font-semibold text-slate-700 whitespace-nowrap">
                          {!f.secundario ? <span className="text-slate-400 italic font-sans">-</span>
                            : esPersonas ? f.secundario : <PatenteChip valor={f.secundario} tipo={f.tipoIdentificacion} />}
                        </td>
                        <td className="py-3 px-6">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold border bg-primary-lighter text-primary border-primary/20 whitespace-nowrap">
                            {f.clasificacion || "-"}
                          </span>
                        </td>
                        <td className="py-3 px-6">
                          <EvaluacionCelda evaluacion={f.evaluacion} />
                        </td>
                        {accionFila && <td className="py-3 px-6 text-right">{accionFila(f)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};
