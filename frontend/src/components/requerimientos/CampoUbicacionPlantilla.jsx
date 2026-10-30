import { useEffect, useState } from "react";
import { AlertTriangle, FolderTree } from "lucide-react";
import { requerimientoService } from "../../services/requerimientoService";

const clave = (o) => `${o.seccionClave}|${o.documentoClave || ""}`;

// Campo "Ubicación en la estructura de carpetas" del formulario de Requerimiento: documentos (y
// secciones sin documentos) de la plantilla activa del Mandante para su tipo de entidad, con
// selección múltiple. Un documento tiene UN solo requerimiento: elegir uno vinculado a otro lo
// mueve a este al guardar (se avisa). El vínculo se guarda en la plantilla (nueva versión), en la
// misma transacción que el requerimiento. Sin plantilla activa el campo no aparece: solo un aviso.
//  - `valor`: claves elegidas ("seccion|documento"), o null mientras carga.
//  - `onCargado(claves)`: selección actual del requerimiento al abrir (base de "hay cambios").
//  - `onChange(claves)`.
export const CampoUbicacionPlantilla = ({ mandanteId, tipoEntidad, requerimientoId = null, valor, onCargado, onChange, disabled }) => {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    requerimientoService.ubicacionesPlantilla({ mandanteId, tipoEntidad })
      .then((d) => {
        if (!vigente) return;
        setDatos(d);
        onCargado?.((d.opciones || []).filter((o) => requerimientoId && o.requerimientoId === requerimientoId).map(clave));
      })
      .catch((err) => { if (vigente) setError(err.message || "No se pudo cargar la estructura de carpetas."); });
    return () => { vigente = false; };
    // Solo al abrir: las opciones no cambian mientras se edita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandanteId, tipoEntidad, requerimientoId]);

  if (error) return <p className="text-[11px] text-red-600">{error}</p>;
  if (!datos) return <p className="text-[11px] text-slate-400">Cargando la estructura de carpetas...</p>;
  if (!datos.plantilla) {
    return (
      <p className="flex items-start gap-1.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
        Este Mandante no tiene una plantilla de estructura de carpetas activa: la ubicación del requerimiento se podrá indicar
        cuando se active una (Configuración → Inteligencia Artificial → Estructura de carpetas).
      </p>
    );
  }

  const elegidos = new Set(valor || []);
  const secciones = [];
  datos.opciones.forEach((o) => {
    let s = secciones.find((x) => x.clave === o.seccionClave);
    if (!s) { s = { clave: o.seccionClave, nombre: o.seccion, opciones: [] }; secciones.push(s); }
    s.opciones.push(o);
  });
  const alternar = (k) => onChange(elegidos.has(k) ? [...elegidos].filter((x) => x !== k) : [...elegidos, k]);
  const tipos = [...new Set(datos.opciones.filter((o) => elegidos.has(clave(o)) && o.tipoDocumentalCodigo).map((o) => o.tipoDocumentalCodigo))];

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <FolderTree className="w-3.5 h-3.5 text-primary" /> Plantilla «{datos.plantilla.nombre}» · versión {datos.plantilla.version}.
        Dónde está el documento en la carpeta de la empresa (puede elegir varios).
      </p>
      {datos.opciones.length === 0 ? (
        <p className="text-[11px] text-slate-400">La plantilla no tiene documentos para este tipo de entidad.</p>
      ) : (
        <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
          {secciones.map((s) => (
            <div key={s.clave} className="p-2.5 space-y-1">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{s.nombre}</p>
              {s.opciones.map((o) => {
                const k = clave(o);
                const marcado = elegidos.has(k);
                const deOtro = o.requerimientoId && o.requerimientoId !== requerimientoId;
                return (
                  <label key={k} className={`flex items-start gap-2 text-xs ${disabled ? "" : "cursor-pointer"}`}>
                    <input type="checkbox" checked={marcado} disabled={disabled} onChange={() => alternar(k)}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30" />
                    <span className="min-w-0">
                      <span className="font-semibold text-carbon-dark">{o.documento || "Carpeta completa de la sección"}</span>
                      {o.tipoDocumentalCodigo && <span className="ml-1.5 text-[10px] text-slate-400">{o.tipoDocumentalCodigo}</span>}
                      {!o.habilitado && <span className="ml-1.5 text-[10px] font-bold text-slate-400">Deshabilitado</span>}
                      {o.sensible && <span className="ml-1.5 text-[10px] font-bold text-slate-400">Dato sensible</span>}
                      {deOtro && (
                        <span className={`block text-[10px] ${marcado ? "text-amber-700 font-semibold" : "text-slate-400"}`}>
                          {marcado ? `Hoy es de «${o.requerimientoNombre || "otro requerimiento"}»: al guardar pasa a este.` : `Vinculado a «${o.requerimientoNombre || "otro requerimiento"}»`}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {tipos.length > 1 && (
        <p className="text-[11px] text-amber-700">
          Los documentos elegidos son de distintos tipos documentales ({tipos.join(", ")}): el requerimiento no podrá revisarse con IA
          por carpeta hasta que todos coincidan con su tipo documental.
        </p>
      )}
    </div>
  );
};
