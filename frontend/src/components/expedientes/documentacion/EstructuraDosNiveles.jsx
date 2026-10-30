import { useEffect, useState } from "react";
import { Folder } from "lucide-react";
import { leerDosNiveles } from "../../../services/fuentes/carpetaLocal";

// Estructura de una carpeta local (primer y segundo nivel), para la pestaña Documentación.
// `handle`: carpeta con el permiso ya concedido.
export const EstructuraDosNiveles = ({ handle }) => {
  const [lectura, setLectura] = useState({ handle: null, niveles: null });

  useEffect(() => {
    if (!handle) return undefined;
    let vigente = true;
    leerDosNiveles(handle)
      .then((n) => { if (vigente) setLectura({ handle, niveles: n }); })
      .catch(() => { if (vigente) setLectura({ handle, niveles: [] }); });
    return () => { vigente = false; };
  }, [handle]);

  const niveles = lectura.handle === handle ? lectura.niveles : null;
  return (
    <div className="space-y-2 pt-2 border-t border-slate-100">
      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Estructura de la carpeta</h4>
      {!niveles ? <p className="text-xs text-slate-400">Leyendo la carpeta...</p> : niveles.length === 0 ? (
        <p className="text-xs text-slate-400">La carpeta no tiene subcarpetas.</p>
      ) : (
        <ul className="text-xs space-y-1 max-h-80 overflow-y-auto">
          {niveles.map((n) => (
            <li key={n.ruta}>
              <span className="flex items-center gap-1.5 font-semibold text-carbon-dark"><Folder className="w-3.5 h-3.5 text-primary" /> {n.nombre}</span>
              {n.carpetas.length > 0 && (
                <ul className="pl-6 mt-0.5 space-y-0.5 text-slate-500">
                  {n.carpetas.map((c) => <li key={c.ruta} className="flex items-center gap-1.5"><Folder className="w-3 h-3" /> {c.nombre}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
