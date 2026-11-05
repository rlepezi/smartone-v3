import { useEffect, useState } from "react";
import { ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import { listarDirectorio } from "../../../services/fuentes/carpetaLocal";
import { formatTamano } from "../../../utils/repositorioDocumental";

// Un nivel del árbol: sus subcarpetas (que se despliegan en el lugar) y sus archivos. Se lee al
// desplegarlo.
const Nivel = ({ handle, ruta, profundidad, onElegirArchivo }) => {
  const [contenido, setContenido] = useState(null); // { carpetas, archivos }
  const [abiertas, setAbiertas] = useState(() => new Set());
  useEffect(() => {
    let vigente = true;
    listarDirectorio(handle, ruta)
      .then((l) => { if (vigente) setContenido(l || { carpetas: [], archivos: [] }); })
      .catch(() => { if (vigente) setContenido({ carpetas: [], archivos: [] }); });
    return () => { vigente = false; };
  }, [handle, ruta]);
  const alternar = (r) => setAbiertas((s) => {
    const n = new Set(s);
    if (n.has(r)) n.delete(r); else n.add(r);
    return n;
  });
  const sangria = { paddingLeft: `${profundidad * 16 + 12}px` };

  if (!contenido) return <li className="py-2 text-xs text-slate-400" style={sangria}>Leyendo...</li>;
  if (!contenido.carpetas.length && !contenido.archivos.length) {
    return <li className="py-2 text-xs text-slate-400" style={sangria}>Carpeta vacía.</li>;
  }
  return (
    <>
      {contenido.carpetas.map((c) => {
        const abierta = abiertas.has(c.ruta);
        return (
          <li key={c.ruta}>
            <button type="button" onClick={() => alternar(c.ruta)} aria-expanded={abierta} style={sangria}
              className="w-full flex items-center gap-2 pr-3 py-2 text-left text-xs font-semibold text-carbon-dark hover:bg-slate-50 border-b border-slate-100">
              <ChevronRight className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${abierta ? "rotate-90" : ""}`} />
              {abierta ? <FolderOpen className="w-4 h-4 shrink-0 text-primary" /> : <Folder className="w-4 h-4 shrink-0 text-primary" />}
              <span className="flex-1 min-w-0 truncate">{c.nombre}</span>
            </button>
            {abierta && <ul><Nivel handle={handle} ruta={c.ruta} profundidad={profundidad + 1} onElegirArchivo={onElegirArchivo} /></ul>}
          </li>
        );
      })}
      {contenido.archivos.map((a) => (
        <li key={a.ruta}>
          <button type="button" onClick={() => onElegirArchivo(a.ruta)} title={`Elegir y ver «${a.nombre}»`} style={{ paddingLeft: `${profundidad * 16 + 32}px` }}
            className="w-full flex items-center gap-2 pr-3 py-1.5 text-left text-xs text-slate-700 hover:bg-primary-lighter/50 border-b border-slate-100">
            <FileText className="w-4 h-4 shrink-0 text-slate-400" />
            <span className="flex-1 min-w-0 truncate">{a.nombre}</span>
            <span className="shrink-0 text-[10px] text-slate-400">{formatTamano(a.tamanoBytes)}</span>
          </button>
        </li>
      ))}
    </>
  );
};

// Árbol de la carpeta del expediente dentro del panel (sin modal): cada carpeta se despliega en el
// lugar con la flecha (sus subcarpetas y archivos, leídos al abrirla); al hacer clic en un archivo,
// ese es el documento del requerimiento (`onElegirArchivo(rutaRelativa)`).
export const ArbolCarpetas = ({ handle, raiz = "", onElegirArchivo }) => (
  <div className="flex flex-col h-full min-h-0">
    <div className="px-3 py-2 border-b border-slate-100 space-y-0.5">
      <p className="text-[11px] font-bold text-carbon-dark truncate">{raiz ? raiz.split("/").pop() : handle.name}</p>
      <p className="text-[11px] text-slate-500">Despliegue las carpetas con la flecha y elija el documento.</p>
    </div>
    <ul className="flex-1 min-h-0 overflow-y-auto">
      <Nivel handle={handle} ruta={raiz} profundidad={0} onElegirArchivo={onElegirArchivo} />
    </ul>
  </div>
);
