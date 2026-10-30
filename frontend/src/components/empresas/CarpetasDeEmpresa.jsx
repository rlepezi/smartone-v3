import { useEffect, useState } from "react";
import { Eye, EyeOff, Folder, FolderOpen, KeyRound } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { carpetaEmpresaService } from "../../services/carpetaEmpresaService";
import { useFuenteNuevaEmpresa } from "../../hooks/useFuenteNuevaEmpresa";
import { PanelCarpetaEmpresa } from "./PanelCarpetaEmpresa";

const BADGE = "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap";
const ESTADO_MAPEO = {
  sin_mapear: ["Sin mapear", "bg-slate-50 text-slate-500 border-slate-200"],
  parcial: ["Mapeo parcial", "bg-amber-50 text-amber-700 border-amber-200"],
  completo: ["Mapeo completo", "bg-sage-lighter text-sage-darker border-sage-light"],
};
const ESTADO_EXPEDIENTE = { creado: "Creado", en_ejecucion: "En ejecución", completado: "Completado", completado_pendientes: "Completado con pendientes", cerrado: "Cerrado" };

// Documentos de una carpeta en la fuente local de SU Mandante (autorizada en este navegador).
export const DocumentosCarpeta = ({ carpeta, onRut, onRazonSocial }) => {
  const { profile } = useAuth();
  const fuenteNE = useFuenteNuevaEmpresa(profile?.uid, carpeta.mandanteId, true);
  if (fuenteNE.fuente === undefined) return <p className="text-xs text-slate-400">Buscando la fuente documental...</p>;
  if (fuenteNE.fuente?.tipo === "sharepoint") {
    return <p className="text-xs text-slate-500">La carpeta está en SharePoint: la vista de documentos estará disponible cuando se conecte Microsoft Graph.</p>;
  }
  if (!fuenteNE.autorizada) {
    const { base } = fuenteNE;
    return (
      <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800 space-y-2">
        <p>La fuente «{fuenteNE.fuente?.etiqueta}» no está autorizada en este navegador.</p>
        <button type="button" onClick={base.handle && base.coincideFuente ? base.autorizar : base.autorizarFuente} disabled={!base.soportado}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-carbon-dark hover:bg-slate-50">
          <KeyRound className="w-3.5 h-3.5" /> Autorizar «{fuenteNE.fuente?.etiqueta}»
        </button>
      </div>
    );
  }
  return (
    <PanelCarpetaEmpresa handle={fuenteNE.base.handle} ruta={carpeta.ruta} mandanteId={carpeta.mandanteId}
      onRut={onRut} onRazonSocial={onRazonSocial} />
  );
};

// Carpetas de empresa vinculadas a una Empresa (todas las que el usuario puede ver): ruta, proyecto,
// expediente y avance del mapeo. "Ver documentos" avisa a quien lo usa (`onVer(carpeta | null)`)
// para mostrar el panel de documentos junto al formulario. Si el rol no puede ver carpetas, no se
// muestra nada.
export const CarpetasDeEmpresa = ({ empresaId, vista = null, onVer }) => {
  const [estado, setEstado] = useState({ empresaId: null, lista: null });
  useEffect(() => {
    let vigente = true;
    carpetaEmpresaService.listar({ empresaId })
      .then((l) => { if (vigente) setEstado({ empresaId, lista: l || [] }); })
      .catch(() => { if (vigente) setEstado({ empresaId, lista: false }); });
    return () => { vigente = false; };
  }, [empresaId]);
  const lista = estado.empresaId === empresaId ? estado.lista : null;
  if (lista === false) return null;

  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-3">
      <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
        <FolderOpen className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Carpetas de la empresa</h3>
      </div>
      {lista === null ? <p className="text-xs text-slate-400">Cargando carpetas...</p> : lista.length === 0 ? (
        <p className="text-xs text-slate-500">Esta empresa no tiene carpetas vinculadas. Se vinculan al crearla desde su carpeta, en Mapeo documental o en Nueva Acreditación.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {lista.map((c) => {
            const [etqMapeo, claseMapeo] = ESTADO_MAPEO[c.estadoMapeo] || ESTADO_MAPEO.sin_mapear;
            const abierta = vista?.id === c.id;
            return (
              <li key={c.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <Folder className="w-4 h-4 shrink-0 text-primary" />
                <span className="font-bold text-carbon-dark min-w-0 truncate" title={c.ruta}>{c.ruta}</span>
                <span className={`${BADGE} ${claseMapeo}`}>{etqMapeo}{c.avance?.total ? ` · ${c.avance.ubicados}/${c.avance.total}` : ""}</span>
                <span className="text-slate-500">
                  {c.proyectoNombre ? `Proyecto ${c.proyectoNombre}` : "Sin proyecto"}
                  {" · "}
                  {c.expedienteId ? `Expediente ${ESTADO_EXPEDIENTE[c.expedienteEstado] || c.expedienteEstado || ""}`.trim() : "Libre (sin expediente)"}
                </span>
                {onVer && (
                  <button type="button" onClick={() => onVer(abierta ? null : c)} className="ml-auto inline-flex items-center gap-1 font-bold text-primary hover:underline">
                    {abierta ? <><EyeOff className="w-3.5 h-3.5" /> Ocultar documentos</> : <><Eye className="w-3.5 h-3.5" /> Ver documentos</>}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
