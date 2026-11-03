import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { mapeoRequerimientoService } from "../../../services/mapeoRequerimientoService";
import { FileText, Folder, FolderTree, ShieldAlert } from "lucide-react";

const ENLACE_MAPEO = "/configuracion/ia?tab=mapeo";
const TIPO_NODO = {
  seccion: "carpeta de la sección",
  archivoSuelto: "archivo de la sección",
  documentoEntidad: "documento por persona o maquinaria",
};

// Ubicación de un requerimiento en el Mapeo documental, en solo lectura: los nodos de la plantilla a
// los que está vinculado ("Carpetas Personales › Cédula de identidad · documento por persona") y el
// enlace para editarlo. `nodos`: [{ nodoClave, ruta, tipoNodo, nivel, habilitado }].
export const UbicacionNodos = ({ nodos }) => (
  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5">
    <p className="flex items-center gap-1.5 text-xs font-bold text-carbon-dark">
      <FolderTree className="w-3.5 h-3.5 text-primary" /> Ubicación en el mapeo documental
      <Link to={ENLACE_MAPEO} className="ml-auto text-[11px] font-bold text-primary hover:underline">Editar en Mapeo documental</Link>
    </p>
    {(nodos || []).length === 0 ? (
      <p className="text-[11px] text-amber-700">Sin ubicar: vincule el requerimiento a un nodo de la plantilla.</p>
    ) : (
      <ul className="space-y-0.5">
        {nodos.map((n) => (
          <li key={n.nodoClave} className={`flex items-center gap-1.5 text-[11px] ${n.habilitado === false ? "text-slate-400" : "text-slate-700"}`}>
            {n.tipoNodo === "seccion" ? <Folder className="w-3 h-3 shrink-0 text-primary" /> : <FileText className="w-3 h-3 shrink-0 text-slate-400" />}
            <span className="font-semibold text-carbon-dark">{n.ruta}</span>
            <span className="text-slate-400">· {TIPO_NODO[n.tipoNodo] || n.tipoNodo}{n.habilitado === false ? " · deshabilitado" : ""}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

// Reglas bloqueadas: sin nodo vinculado no se pueden definir.
export const SinMapeo = () => (
  <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50 text-xs text-amber-800 space-y-2">
    <p className="flex items-center gap-1.5 font-bold"><ShieldAlert className="w-4 h-4" /> Primero ubica este requerimiento en el Mapeo documental</p>
    <p>Las reglas de revisión dependen del mapeo: la IA lee los documentos del nodo donde está ubicado.</p>
    <Link to={ENLACE_MAPEO} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark">
      <FolderTree className="w-3.5 h-3.5" /> Ir al Mapeo documental
    </Link>
  </div>
);

// La misma ubicación, leyéndola (formulario del requerimiento).
export const UbicacionNodosRequerimiento = ({ requerimientoId }) => {
  const [estado, setEstado] = useState({ id: null, nodos: null, error: null });
  useEffect(() => {
    let vigente = true;
    mapeoRequerimientoService.porRequerimiento(requerimientoId)
      .then((r) => { if (vigente) setEstado({ id: requerimientoId, nodos: r?.nodos || [], error: null }); })
      .catch((err) => { if (vigente) setEstado({ id: requerimientoId, nodos: null, error: err.message || "No se pudo leer el mapeo." }); });
    return () => { vigente = false; };
  }, [requerimientoId]);
  const actual = estado.id === requerimientoId ? estado : { nodos: null, error: null };
  if (actual.error) return <p className="text-[11px] text-amber-700">{actual.error}</p>;
  if (!actual.nodos) return <p className="text-[11px] text-slate-400">Cargando la ubicación...</p>;
  return <UbicacionNodos nodos={actual.nodos} />;
};
