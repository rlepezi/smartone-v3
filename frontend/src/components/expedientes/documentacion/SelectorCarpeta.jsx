import { useEffect, useState } from "react";
import { ChevronRight, File, Folder, FolderOpen, Star, X } from "lucide-react";
import { listarDirectorio } from "../../../services/fuentes/carpetaLocal";
import { esCarpetaDestacada, esPosibleListado } from "../../../utils/carpetasSujetos";
import { formatTamano } from "../../../utils/repositorioDocumental";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO } from "./estilos";

const TEXTO_TIPO = { persona: "la carpeta del personal", recurso: "la carpeta de maquinarias" };

// Navegador interno de la carpeta raíz YA vinculada (no abre showDirectoryPicker ni pide permisos):
// a la izquierda las subcarpetas del nivel actual con breadcrumb (nunca sube de la raíz); a la
// derecha la vista previa de la carpeta en la que se hizo clic (sus subcarpetas = elementos
// detectados, y sus archivos sueltos). Resalta, sin elegir, las carpetas cuyo nombre sugiere el tipo
// buscado. "Usar esta carpeta" devuelve la ruta relativa.
export const SelectorCarpeta = ({ handle, tipo = null, rutaInicial = "", titulo, onElegir, onCerrar }) => {
  const [actual, setActual] = useState(rutaInicial || "");
  const [listado, setListado] = useState(null);
  const [elegida, setElegida] = useState(rutaInicial || null);
  const [vista, setVista] = useState(null);

  useEffect(() => {
    let vigente = true;
    listarDirectorio(handle, actual).then((l) => { if (vigente) setListado(l || { carpetas: [], archivos: [] }); });
    return () => { vigente = false; };
  }, [handle, actual]);

  useEffect(() => {
    if (elegida === null) return undefined;
    let vigente = true;
    listarDirectorio(handle, elegida).then((l) => { if (vigente) setVista({ ruta: elegida, ...(l || { carpetas: [], archivos: [] }) }); });
    return () => { vigente = false; };
  }, [handle, elegida]);

  const partes = actual.split("/").filter(Boolean);
  const entrar = (ruta) => { setActual(ruta); setElegida(ruta); setListado(null); };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-labelledby="selector-carpeta-titulo" onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-dropdown w-full max-w-4xl max-h-[88vh] flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <FolderOpen className="w-5 h-5 text-primary" />
          <div className="min-w-0 mr-auto">
            <h3 id="selector-carpeta-titulo" className="text-sm font-bold text-carbon-dark">{titulo || "Elegir carpeta"}</h3>
            {tipo && <p className="text-[11px] text-slate-500">Elija {TEXTO_TIPO[tipo]}. Las que parecen serlo aparecen destacadas con ★.</p>}
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 min-h-0 flex-1 overflow-hidden">
          <div className="border-b md:border-b-0 md:border-r border-slate-100 flex flex-col min-h-0">
            <nav className="flex flex-wrap items-center gap-1 px-4 py-2 text-[11px] text-slate-500 border-b border-slate-100" aria-label="Ruta">
              <button type="button" onClick={() => entrar("")} className="font-bold text-carbon-dark hover:underline">{handle.name}</button>
              {partes.map((p, i) => (
                <span key={`${p}-${i}`} className="flex items-center gap-1"><ChevronRight className="w-3 h-3" />
                  <button type="button" onClick={() => entrar(partes.slice(0, i + 1).join("/"))} className="hover:underline">{p}</button>
                </span>
              ))}
            </nav>
            <ul className="overflow-y-auto flex-1 p-2 space-y-0.5">
              {!listado && <li className="p-2 text-xs text-slate-400">Leyendo...</li>}
              {listado && listado.carpetas.length === 0 && <li className="p-2 text-xs text-slate-400">Sin subcarpetas.</li>}
              {listado?.carpetas.map((c) => {
                const destacada = tipo && esCarpetaDestacada(c.nombre, tipo);
                return (
                  <li key={c.ruta} className={`flex items-center gap-1 rounded-lg ${elegida === c.ruta ? "bg-primary-lighter" : "hover:bg-slate-50"}`}>
                    <button type="button" onClick={() => setElegida(c.ruta)} className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left text-xs">
                      <Folder className={`w-4 h-4 shrink-0 ${destacada ? "text-amber-500" : "text-primary"}`} />
                      <span className={`truncate ${destacada ? "font-bold text-carbon-dark" : "text-slate-700"}`}>{c.nombre}</span>
                      {destacada && <Star className="w-3 h-3 shrink-0 text-amber-500" aria-label="Sugerida" />}
                    </button>
                    <button type="button" onClick={() => entrar(c.ruta)} aria-label={`Entrar a ${c.nombre}`} className="p-1.5 rounded text-slate-400 hover:text-carbon-dark"><ChevronRight className="w-4 h-4" /></button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-col min-h-0">
            <p className="px-4 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 truncate">
              Vista previa{vista ? `: ${vista.ruta || handle.name}` : ""}
            </p>
            <div className="overflow-y-auto flex-1 p-3 space-y-3 text-xs">
              {!vista ? <p className="text-slate-400">Haga clic en una carpeta para ver su contenido.</p> : (
                <>
                  <div>
                    <p className="font-bold text-carbon-dark mb-1">Elementos detectados ({vista.carpetas.length})</p>
                    {vista.carpetas.length === 0 ? <p className="text-slate-400">Sin subcarpetas.</p> : (
                      <ul className="space-y-0.5 text-slate-600">
                        {vista.carpetas.map((c) => <li key={c.ruta} className="flex items-center gap-1.5"><Folder className="w-3.5 h-3.5 text-slate-400" /> {c.nombre}</li>)}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-carbon-dark mb-1">Archivos sueltos ({vista.archivos.length})</p>
                    {vista.archivos.length === 0 ? <p className="text-slate-400">Sin archivos.</p> : (
                      <ul className="space-y-0.5 text-slate-600">
                        {vista.archivos.map((a) => (
                          <li key={a.ruta} className="flex items-center gap-1.5">
                            <File className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{a.nombre}</span>
                            <span className="text-slate-400 shrink-0">{formatTamano(a.tamanoBytes)}</span>
                            {esPosibleListado(a.nombre) && <span className="shrink-0 px-1.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-700">Posible listado</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <button type="button" onClick={onCerrar} className={CLASE_SECUNDARIO}>Cancelar</button>
          <button type="button" disabled={elegida === null || elegida === ""} onClick={() => onElegir(elegida)} className={CLASE_PRIMARIO}>
            Usar esta carpeta
          </button>
        </div>
      </div>
    </div>
  );
};
