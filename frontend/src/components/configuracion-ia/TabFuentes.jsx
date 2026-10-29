import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useMandanteContexto } from "../../hooks/useMandanteContexto";
import { fuenteDocumentalService } from "../../services/fuenteDocumentalService";
import { CampoMandante } from "../shared/CampoMandante";
import { CarpetaLocalCard } from "./CarpetaLocalCard";
import { SharePointCard } from "./SharePointCard";
import { CarpetasEmpresaLista } from "./CarpetasEmpresaLista";

// Pestaña "Fuentes documentales" (superadmin; mandante_admin solo su Mandante). La fuente es la
// raíz del árbol de carpetas del Mandante (una subcarpeta por empresa y proyecto) y hay una sola
// activa: carpeta local (solo superadmin la registra o cambia) o SharePoint (superadmin y
// mandante_admin). Debajo, las Carpetas de empresa de la fuente activa (solo lectura). El superadmin
// con varios Mandantes elige uno; con uno solo viene preseleccionado.
export const TabFuentes = () => {
  const { profile } = useAuth();
  const contexto = useMandanteContexto();
  const { mandanteId, modo } = contexto;
  const esSuperadmin = profile?.rol === "superadmin";
  const [carga, setCarga] = useState({ mandanteId: null, fuentes: null, error: null });
  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!mandanteId) return undefined;
    let vigente = true;
    fuenteDocumentalService.listar(mandanteId)
      .then((lista) => { if (vigente) setCarga({ mandanteId, fuentes: lista || [], error: null }); })
      .catch((err) => { if (vigente) setCarga({ mandanteId, fuentes: [], error: err.message || "No se pudieron cargar las fuentes." }); });
    return () => { vigente = false; };
  }, [mandanteId, version]);

  const fuentes = carga.mandanteId === mandanteId ? carga.fuentes : null;
  const activa = (fuentes || []).find((f) => f.estado === "activa") || null;

  return (
    <div className="space-y-6">
      {modo === "seleccionable" && (
        <div className="max-w-sm">
          <CampoMandante contexto={contexto} conFoco={false} />
        </div>
      )}
      {modo === "ninguno" && <CampoMandante contexto={contexto} />}
      {!mandanteId ? (
        modo === "seleccionable" && <p className="py-8 text-center text-xs text-slate-400">Seleccione un Mandante para ver sus fuentes documentales.</p>
      ) : !fuentes ? (
        <div className="h-24 rounded-2xl bg-slate-50 animate-pulse" aria-hidden="true" />
      ) : (
        <>
          {carga.error && <p role="alert" className="text-xs text-red-600">{carga.error}</p>}
          <p className="text-xs text-slate-500">
            Fuente activa: {activa
              ? <b className="text-carbon-dark">{activa.tipo === "local" ? `Carpeta local «${activa.etiqueta}»` : `SharePoint «${activa.etiqueta}»`}</b>
              : <b className="text-amber-700">ninguna</b>}. Solo puede haber una por Mandante.
          </p>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            <CarpetaLocalCard key={`carpeta-${mandanteId}`} usuarioId={profile?.uid} mandanteId={mandanteId} fuentes={fuentes} esSuperadmin={esSuperadmin} onCambio={recargar} />
            <SharePointCard key={`${mandanteId}-${version}`} mandanteId={mandanteId} onCambio={recargar} />
          </div>
          <CarpetasEmpresaLista mandanteId={mandanteId} fuenteId={activa?.id || null} version={version} />
        </>
      )}
    </div>
  );
};
