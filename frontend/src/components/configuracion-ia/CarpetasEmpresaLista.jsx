import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FolderTree } from "lucide-react";
import { carpetaEmpresaService } from "../../services/carpetaEmpresaService";
import { ESTADOS_MAPEO } from "../../utils/estadosMapeo";
import { Tarjeta } from "./Tarjeta";

const BADGE = "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap";

// Carpetas de empresa de la fuente activa del Mandante (solo lectura): cada subcarpeta vinculada a
// una empresa en un proyecto, con su expediente y el estado de su mapeo. `version` cambia cuando
// cambian las fuentes (para recargar).
export const CarpetasEmpresaLista = ({ mandanteId, fuenteId, version = 0 }) => {
  const [carga, setCarga] = useState({ clave: null, lista: null, error: null });
  const clave = `${mandanteId}|${fuenteId || ""}|${version}`;

  useEffect(() => {
    if (!mandanteId || !fuenteId) return undefined;
    let vigente = true;
    carpetaEmpresaService.listar({ mandanteId, fuenteId })
      .then((lista) => { if (vigente) setCarga({ clave, lista: lista || [], error: null }); })
      .catch((err) => { if (vigente) setCarga({ clave, lista: [], error: err.message || "No se pudieron cargar las carpetas." }); });
    return () => { vigente = false; };
  }, [mandanteId, fuenteId, clave]);

  const actual = carga.clave === clave ? carga : null;
  return (
    <Tarjeta titulo="Carpetas de empresa" Icono={FolderTree}>
      {!fuenteId ? (
        <p className="py-4 text-center text-xs text-slate-400">Configure la fuente documental para ver sus carpetas de empresa.</p>
      ) : !actual ? (
        <div className="h-16 rounded-xl bg-slate-50 animate-pulse" aria-hidden="true" />
      ) : actual.error ? (
        <p role="alert" className="text-xs text-red-600">{actual.error}</p>
      ) : actual.lista.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">Aún no hay carpetas de empresa: se crean al vincular la carpeta en Nueva Acreditación o en la pestaña Documentación del expediente.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-xl text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                {["Carpeta", "Empresa", "Proyecto", "Expediente", "Mapeo", "Estado"].map((t) => <th key={t} className="py-2 pr-3 font-bold">{t}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {actual.lista.map((c) => {
                const mapeo = ESTADOS_MAPEO[c.estadoMapeo] || ESTADOS_MAPEO.sin_mapear;
                return (
                  <tr key={c.id}>
                    <td className="py-2 pr-3 font-semibold text-carbon-dark">{c.ruta}</td>
                    <td className="py-2 pr-3 text-slate-600">{c.empresaNombre || "—"}</td>
                    <td className="py-2 pr-3 text-slate-600">{[c.proyectoCodigo, c.proyectoNombre].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="py-2 pr-3">
                      {c.expedienteId
                        ? <Link to={`/expedientes/${c.expedienteId}`} className="font-bold text-primary hover:underline">Ver expediente</Link>
                        : <span className="text-slate-400">Libre</span>}
                    </td>
                    <td className="py-2 pr-3"><span className={`${BADGE} ${mapeo.clase}`}>{mapeo.label}</span></td>
                    <td className="py-2 pr-3 text-slate-600">{c.estado === "activa" ? "Activa" : "Inactiva"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
};
