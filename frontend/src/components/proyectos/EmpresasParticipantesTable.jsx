import React, { useState } from "react";
import { Loader2, Search, Truck, Users } from "lucide-react";
import { claseCumplimiento, estadoPorCumplimiento } from "../../utils/cumplimientoClases";

export const BarraCumplimiento = ({ pct }) => {
  if (pct === null || pct === undefined) {
    return <span className="text-[11px] text-slate-300">-</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${claseCumplimiento(pct)}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-carbon-dark">{pct}%</span>
    </div>
  );
};

// Los perfiles de participación son nombres libres definidos por cada
// Mandante (Permanente/Temporal/Convenio son solo ejemplos), así que el
// color se deriva del nombre — mismo perfil, mismo color siempre. Se evita
// a propósito verde/ámbar/rojo, que en este sistema significan estado.
const PALETA_PERFIL = [
  "bg-primary-lighter text-primary-dark border-primary-light",
  "bg-violet-100 text-violet-700 border-violet-200",
  "bg-sky-100 text-sky-700 border-sky-200",
  "bg-slate-100 text-slate-600 border-slate-200",
];

const clasePerfil = (nombre) => {
  const texto = (nombre || "").toLowerCase();
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = (hash * 31 + texto.charCodeAt(i)) >>> 0;
  return PALETA_PERFIL[hash % PALETA_PERFIL.length];
};

const OPCIONES_ESTADO = [
  { value: "", label: "Todos los estados" },
  { value: "acreditado", label: "Acreditado" },
  { value: "en_proceso", label: "En proceso" },
  { value: "pendiente", label: "Pendiente" },
  { value: "sin_evaluar", label: "Sin evaluar" },
];

// Tabla de Empresas Participantes de un Proyecto. `datos` es la respuesta
// de GET /reportes/proyectos/:id/participantes: undefined mientras carga,
// null si falló, o la lista. Con `conFiltros` agrega buscador por nombre y
// filtro por estado (para cuando es la vista principal y no una fila).
// `accionFila(row)` (opcional) agrega una columna de Acciones por Empresa; el detalle de
// Proyecto la pasa solo en modo edición.
export const EmpresasParticipantesTable = ({ datos, onIrEmpresa, conFiltros = false, accionFila }) => {
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  if (datos === undefined) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando empresas...
      </div>
    );
  }
  if (datos === null) {
    return <p className="text-xs text-red-600 py-2">No se pudieron cargar las empresas de este proyecto.</p>;
  }
  if (datos.length === 0) {
    return <p className="text-xs text-slate-400 py-2">Este proyecto no tiene empresas participando activamente.</p>;
  }

  const term = busqueda.trim().toLowerCase();
  const visibles = conFiltros
    ? datos.filter((e) => {
        const coincideNombre = !term || e.empresaNombre.toLowerCase().includes(term) || (e.rut || "").toLowerCase().includes(term);
        const coincideEstado = !filtroEstado || estadoPorCumplimiento(e.cumplimientoPct).clave === filtroEstado;
        return coincideNombre && coincideEstado;
      })
    : datos;

  return (
    <div className="space-y-3">
      {conFiltros && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o RUT de empresa..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
            />
          </div>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
          >
            {OPCIONES_ESTADO.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {visibles.length === 0 ? (
        <p className="text-xs text-slate-400 py-2">Ninguna empresa coincide con el filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
          <table className="w-full min-w-[640px] table-fixed text-left border-collapse text-xs">
            <colgroup>
              <col className={accionFila ? "w-[24%]" : "w-[30%]"} />
              <col className={accionFila ? "w-[15%]" : "w-[18%]"} />
              <col className={accionFila ? "w-[17%]" : "w-[20%]"} />
              <col className={accionFila ? "w-[16%]" : "w-[18%]"} />
              <col className={accionFila ? "w-[12%]" : "w-[14%]"} />
              {accionFila && <col className="w-[16%]" />}
            </colgroup>
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-4">Empresa</th>
                <th className="py-2.5 px-4">Participación</th>
                <th className="py-2.5 px-4">Cumplimiento</th>
                <th className="py-2.5 px-4">Recursos</th>
                <th className="py-2.5 px-4">Estado</th>
                {accionFila && <th className="py-2.5 px-4 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((e) => {
                const estado = estadoPorCumplimiento(e.cumplimientoPct);
                return (
                  <tr
                    key={e.empresaId}
                    onClick={() => onIrEmpresa(e.empresaId)}
                    className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <p className="font-bold text-carbon-dark">{e.empresaNombre}</p>
                      {e.rut && <p className="text-[11px] text-slate-400 font-mono">{e.rut}</p>}
                    </td>
                    <td className="py-3 px-4">
                      {e.perfilParticipacion ? (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${clasePerfil(e.perfilParticipacion)}`}>
                          {e.perfilParticipacion}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4"><BarraCumplimiento pct={e.cumplimientoPct} /></td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-4">
                        <span className="inline-flex items-center gap-1 font-bold text-carbon-dark" title="Personas acreditadas / asignadas">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          {e.personas.acreditadas}/{e.personas.total}
                        </span>
                        <span className="inline-flex items-center gap-1 font-bold text-carbon-dark" title="Maquinarias acreditadas / asignadas">
                          <Truck className="w-3.5 h-3.5 text-slate-400" />
                          {e.maquinarias.acreditadas}/{e.maquinarias.total}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${estado.className}`}>
                        {estado.label}
                      </span>
                    </td>
                    {accionFila && (
                      <td className="py-3 px-4 text-right" onClick={(ev) => ev.stopPropagation()}>
                        {accionFila(e)}
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
  );
};
