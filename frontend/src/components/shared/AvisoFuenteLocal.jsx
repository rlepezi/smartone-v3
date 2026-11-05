import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { fuenteDocumentalService } from "../../services/fuenteDocumentalService";
import { MENSAJE_LOCAL_NO_AUTORIZADA } from "../../services/fuenteDocumental";

// Aviso cuando la fuente del Mandante es una carpeta local y este navegador no tiene acceso
// autorizado: en vez de listas vacías, se explica dónde están los documentos y qué hacer.
//  - nombre: nombre de la carpeta local de la fuente; si no se conoce, se lee de la fuente activa
//    del Mandante (`mandanteId`).
//  - children: acciones (p. ej. "Autorizar «X» en este navegador").
export const AvisoFuenteLocal = ({ nombre = null, mandanteId = null, children = null }) => {
  const [leido, setLeido] = useState({ mandanteId: null, nombre: null });
  useEffect(() => {
    if (nombre || !mandanteId) return undefined;
    let vigente = true;
    fuenteDocumentalService.activa(mandanteId)
      .then((f) => { if (vigente) setLeido({ mandanteId, nombre: f?.tipo === "local" ? f.etiqueta : null }); })
      .catch(() => { if (vigente) setLeido({ mandanteId, nombre: null }); });
    return () => { vigente = false; };
  }, [nombre, mandanteId]);
  const nombreFuente = nombre || (leido.mandanteId === mandanteId ? leido.nombre : null);

  return (
    <div role="alert" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-2">
      <p className="flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-px" />
        <span>{MENSAJE_LOCAL_NO_AUTORIZADA(nombreFuente || "de la fuente")}</span>
      </p>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
};
