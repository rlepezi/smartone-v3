import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Folder, FolderTree } from "lucide-react";
import { carpetaEmpresaService } from "../../../services/carpetaEmpresaService";

const relativa = (ruta, base) => (base && ruta.toLowerCase().startsWith(`${base.toLowerCase()}/`) ? ruta.slice(base.length + 1) : ruta);
const ENLACE_MAPEO = "/configuracion/ia?tab=mapeo";

const Ubicacion = ({ u, base }) => (
  <p className="flex items-center gap-1.5 text-[11px] text-slate-600 min-w-0" title={u.ruta}>
    {u.tipo === "archivo" ? <FileText className="w-3 h-3 shrink-0 text-slate-400" /> : <Folder className="w-3 h-3 shrink-0 text-primary" />}
    <span className="truncate">{relativa(u.ruta, base)}</span>
  </p>
);

// Cobertura global del mapeo documental de un requerimiento: "ubicado en X de Y carpetas mapeadas",
// con cada carpeta y la ruta de cada ubicación. `cobertura`: la del Mandante (false si no se pudo
// leer, null mientras carga).
export const CoberturaMapeo = ({ cobertura, requerimientoId }) => {
  if (cobertura === false) return <p className="text-[11px] text-amber-700">No se pudo cargar la cobertura del mapeo documental.</p>;
  if (!cobertura) return <p className="text-[11px] text-slate-400">Cargando la cobertura del mapeo...</p>;
  const lista = cobertura.porRequerimiento[requerimientoId] || [];
  const total = cobertura.carpetasMapeadas;
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-600">
        {total === 0 ? "Aún no hay carpetas mapeadas en este Mandante." : (
          <>Ubicado en <b className="text-carbon-dark">{lista.length} de {total}</b> {total === 1 ? "carpeta mapeada" : "carpetas mapeadas"}.</>
        )}
      </p>
      {lista.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 max-h-64 overflow-y-auto">
          {lista.map((c) => (
            <li key={c.carpetaEmpresaId} className="px-3 py-2 space-y-1">
              <p className="text-xs">
                <span className="font-bold text-carbon-dark">{c.ruta}</span>
                {(c.empresaNombre || c.proyectoNombre) && (
                  <span className="text-slate-500"> · {[c.empresaNombre, c.proyectoNombre].filter(Boolean).join(" · ")}</span>
                )}
              </p>
              {c.ubicaciones.map((u) => <Ubicacion key={u.ruta} u={u} base={c.ruta} />)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// La misma cobertura, leyéndola (para el formulario del requerimiento).
export const CoberturaMapeoRequerimiento = ({ mandanteId, requerimientoId }) => {
  const [estado, setEstado] = useState({ mandanteId: null, cobertura: null });
  useEffect(() => {
    if (!mandanteId) return undefined;
    let vigente = true;
    carpetaEmpresaService.cobertura(mandanteId)
      .then((c) => { if (vigente) setEstado({ mandanteId, cobertura: c }); })
      .catch(() => { if (vigente) setEstado({ mandanteId, cobertura: false }); });
    return () => { vigente = false; };
  }, [mandanteId]);
  return <CoberturaMapeo cobertura={estado.mandanteId === mandanteId ? estado.cobertura : null} requerimientoId={requerimientoId} />;
};

// Ubicación del requerimiento en la carpeta de UN expediente (su Carpeta de empresa): las rutas de
// su mapeo, o el aviso con enlace al Mapeo documental. `entradas`: [{ ruta, tipo }].
export const UbicacionEnExpediente = ({ entradas, carpetaNombre = null }) => (
  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5">
    <p className="flex items-center gap-1.5 text-xs font-bold text-carbon-dark">
      <FolderTree className="w-3.5 h-3.5 text-primary" /> Ubicación en la carpeta de este expediente
      {carpetaNombre && <span className="font-normal text-slate-500 truncate">· {carpetaNombre}</span>}
    </p>
    {entradas.length ? entradas.map((u) => <Ubicacion key={u.ruta} u={u} base={carpetaNombre} />) : (
      <p className="text-[11px] text-slate-500">
        Sin ubicación en la carpeta de este expediente.{" "}
        <Link to={ENLACE_MAPEO} className="font-bold text-primary hover:underline">Ir al Mapeo documental</Link>
      </p>
    )}
  </div>
);
