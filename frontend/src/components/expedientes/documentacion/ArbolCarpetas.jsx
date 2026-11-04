import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Folder, FolderCheck } from "lucide-react";
import { listarDirectorio } from "../../../services/fuentes/carpetaLocal";
import { CLASE_PRIMARIO } from "./estilos";

// Selector de carpeta dentro del panel (sin modal): navega las subcarpetas desde `raiz` (nunca sube
// de ella) y "Usar esta carpeta" devuelve la ruta relativa de la carpeta actual. Solo carpetas: los
// archivos se listan recién cuando se elige una.
export const ArbolCarpetas = ({ handle, raiz = "", onElegir }) => {
  const [actual, setActual] = useState(raiz);
  const [listado, setListado] = useState(null); // { ruta, carpetas }

  useEffect(() => {
    let vigente = true;
    listarDirectorio(handle, actual)
      .then((l) => { if (vigente) setListado({ ruta: actual, carpetas: l?.carpetas || [] }); })
      .catch(() => { if (vigente) setListado({ ruta: actual, carpetas: [] }); });
    return () => { vigente = false; };
  }, [handle, actual]);

  const partes = actual.slice(raiz.length).split("/").filter(Boolean);
  const ir = (i) => setActual([raiz, ...partes.slice(0, i)].filter(Boolean).join("/"));
  const vigente = listado?.ruta === actual ? listado : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-slate-100 space-y-2">
        <p className="text-[11px] text-slate-500">Elija la carpeta donde está el documento.</p>
        <nav className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500" aria-label="Ruta">
          {partes.length > 0 && (
            <button type="button" onClick={() => ir(partes.length - 1)} aria-label="Subir" className="p-0.5 rounded hover:bg-slate-100"><ArrowLeft className="w-3.5 h-3.5" /></button>
          )}
          <button type="button" onClick={() => ir(0)} className="font-bold text-carbon-dark hover:underline truncate max-w-[14rem]">
            {raiz ? raiz.split("/").pop() : handle.name}
          </button>
          {partes.map((p, i) => (
            <span key={`${p}-${i}`} className="flex items-center gap-1"><ChevronRight className="w-3 h-3" />
              <button type="button" onClick={() => ir(i + 1)} className="hover:underline">{p}</button>
            </span>
          ))}
        </nav>
        <button type="button" onClick={() => onElegir(actual)} className={CLASE_PRIMARIO}>
          <FolderCheck className="w-4 h-4" /> Usar esta carpeta
        </button>
      </div>
      <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
        {!vigente && <li className="p-3 text-xs text-slate-400">Leyendo...</li>}
        {vigente && !vigente.carpetas.length && <li className="p-3 text-xs text-slate-400">Sin subcarpetas.</li>}
        {vigente?.carpetas.map((c) => (
          <li key={c.ruta}>
            <button type="button" onClick={() => setActual(c.ruta)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-carbon-dark hover:bg-slate-50">
              <Folder className="w-4 h-4 shrink-0 text-primary" /> <span className="flex-1 min-w-0 truncate">{c.nombre}</span>
              <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
