import { useEffect, useState } from "react";
import { AlertTriangle, FolderTree } from "lucide-react";
import { requerimientoService } from "../../../services/requerimientoService";

// En "Reglas IA": dónde está el documento del requerimiento según la plantilla de estructura (sus
// documentos vinculados), con avisos si no tiene ubicación o si un documento vinculado es de otro
// tipo documental, está deshabilitado o es sensible (en esos casos no es elegible para la revisión
// por carpeta: no se baja al calce por tipo). `onIrADatos`: lleva a la pestaña Datos para asignarla.
// `carpetaExpediente` (abierto desde un expediente): la carpeta asignada ahí tiene prioridad sobre la
// plantilla, así que sin vínculo en la plantilla no hay nada que advertir.
export const UbicacionPlantillaResumen = ({ requerimiento, tipoCodigo, recarga, onIrADatos, carpetaExpediente = null }) => {
  const [datos, setDatos] = useState(null);

  useEffect(() => {
    let vigente = true;
    requerimientoService.ubicacionesPlantilla({ mandanteId: requerimiento.mandanteId, tipoEntidad: requerimiento.tipoEntidad })
      .then((d) => { if (vigente) setDatos(d); })
      .catch(() => { if (vigente) setDatos({ plantilla: null, opciones: [], error: true }); });
    return () => { vigente = false; };
  }, [requerimiento.mandanteId, requerimiento.tipoEntidad, recarga]);

  if (!datos) return null;
  const enlace = onIrADatos && (
    <button type="button" onClick={onIrADatos} className="font-bold text-primary hover:underline">Asignar en la pestaña Datos</button>
  );
  if (!datos.plantilla) {
    return (
      <p className="text-[11px] text-slate-500">
        {datos.error ? "No se pudo leer la estructura de carpetas." : "El Mandante no tiene una plantilla de estructura activa: la ubicación se asigna cuando exista una."}
      </p>
    );
  }
  const propios = datos.opciones.filter((o) => o.requerimientoId === requerimiento.id);
  const avisos = [];
  propios.forEach((o) => {
    const nombre = [o.seccion, o.documento].filter(Boolean).join(" › ");
    if (!o.habilitado) avisos.push(`«${nombre}» está deshabilitado en la plantilla.`);
    else if (o.sensible) avisos.push(`«${nombre}» es un dato sensible.`);
    else if (!o.documentoClave) avisos.push(`«${nombre}» es una sección sin documentos: sirve para ubicar, no para la revisión por carpeta.`);
    else if (tipoCodigo && o.tipoDocumentalCodigo !== tipoCodigo) {
      avisos.push(`«${nombre}» es de otro tipo documental (${o.tipoDocumentalCodigo || "sin tipo"}, el requerimiento es ${tipoCodigo}).`);
    }
  });

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
        <FolderTree className="w-3.5 h-3.5 text-primary" /> Ubicación en la estructura de carpetas
      </p>
      {carpetaExpediente && (
        <p className="text-[11px] text-sage-darker">
          En este expediente: carpeta asignada <b>«{carpetaExpediente}»</b> (tiene prioridad sobre la plantilla).
        </p>
      )}
      {propios.length === 0 ? (
        carpetaExpediente || !onIrADatos ? (
          <p className="text-[11px] text-slate-500">
            Sin documento vinculado en la plantilla «{datos.plantilla.nombre}».
            {!carpetaExpediente && " En el expediente se puede asociar la carpeta del requerimiento desde el panel de documentos; si no, la revisión por carpeta busca por tipo documental."}
          </p>
        ) : (
          <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>
              Sin ubicación en la plantilla «{datos.plantilla.nombre}»: la revisión por carpeta busca por tipo documental.{" "}{enlace}
            </span>
          </p>
        )
      ) : (
        <ul className="text-[11px] text-slate-600 space-y-0.5">
          {propios.map((o) => (
            <li key={`${o.seccionClave}|${o.documentoClave || ""}`}>
              {o.seccion}{o.documento ? ` › ${o.documento}` : " (carpeta completa)"}
              {o.tipoDocumentalCodigo && <span className="ml-1 text-slate-400">{o.tipoDocumentalCodigo}</span>}
            </li>
          ))}
        </ul>
      )}
      {avisos.length > 0 && (
        <div role="alert" className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 space-y-0.5">
          <p className="font-semibold">No es elegible para la revisión por carpeta:</p>
          {avisos.map((a) => <p key={a}>{a}</p>)}
          {enlace}
        </div>
      )}
    </div>
  );
};
