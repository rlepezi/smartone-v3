import { useEffect, useState } from "react";
import { Cloud, FolderOpen, X } from "lucide-react";
import { SelectorCarpetaEmpresa } from "../expedientes/documentacion/SelectorCarpetaEmpresa";
import { useCarpetaBase } from "../../hooks/useCarpetaBase";
import { fuenteDocumentalService } from "../../services/fuenteDocumentalService";
import { carpetaDeUrlSharePoint } from "../../utils/carpetaEmpresa";
import { nombreDeRuta } from "../../utils/deduccionEmpresaCarpeta";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO } from "../expedientes/documentacion/estilos";

// Carpeta raíz del Proyecto (opcional) dentro de la fuente documental del Mandante: la que contiene
// una subcarpeta por empresa. Se muestra (nombre y ruta o URL) con "Cambiar" y "Quitar", o se elige
// con el mismo selector de carpetas de la fuente. No guarda por sí sola: avisa con onCambiar.
//  - valor: { tipo, ruta, url, fuenteId } | null.
//  - onCambiar(valor | null): nueva carpeta, o null para quitarla. Puede ser async; si falla (lanza),
//    el selector queda abierto y quien la usa muestra `error`.
//  - puedeEditar: muestra "Cambiar", "Quitar" y "Seleccionar".
//  - onOmitir: (asistente) muestra "Omitir" junto a "Seleccionar carpeta del proyecto".
//  - error / guardando: estado del guardado de quien la usa.
export const CarpetaProyecto = ({
  mandanteId, usuarioId, valor, onCambiar, puedeEditar = true, puedeConfigurarBase = false, onOmitir = null,
  error = null, guardando = false,
}) => {
  const [eligiendo, setEligiendo] = useState(false);
  const [fuente, setFuente] = useState(undefined); // undefined: cargando
  useEffect(() => {
    if (!eligiendo || !mandanteId) return undefined;
    let vigente = true;
    fuenteDocumentalService.activa(mandanteId)
      .then((f) => { if (vigente) setFuente(f || null); })
      .catch(() => { if (vigente) setFuente(null); });
    return () => { vigente = false; };
  }, [eligiendo, mandanteId]);
  const base = useCarpetaBase(eligiendo ? usuarioId : null, mandanteId, { etiquetaFuente: fuente?.tipo === "local" ? fuente.etiqueta : null });

  const cambiar = async (nuevo) => {
    try {
      await onCambiar(nuevo);
      return true;
    } catch {
      return false;
    }
  };
  const elegir = async (nuevo) => {
    if (await cambiar(nuevo)) setEligiendo(false);
  };

  if (eligiendo) {
    return (
      <div className="space-y-2">
        {fuente === undefined ? <p className="text-xs text-slate-400">Buscando la fuente documental...</p> : (
          <SelectorCarpetaEmpresa
            fuente={fuente}
            base={base}
            empresa={null}
            autoElegir={false}
            seleccionada={valor?.tipo === "local" ? valor.ruta : null}
            onElegir={(nombre) => elegir({ tipo: "local", ruta: nombre, url: null, fuenteId: fuente?.id || null })}
            onElegirUrl={(url) => elegir({ tipo: "sharepoint", ruta: carpetaDeUrlSharePoint(url), url, fuenteId: fuente?.id || null })}
            puedeConfigurarBase={puedeConfigurarBase}
            textoUrl="Pegue la URL de la carpeta del proyecto dentro del sitio de la fuente."
          />
        )}
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <button type="button" onClick={() => setEligiendo(false)} disabled={guardando} className={CLASE_SECUNDARIO}>Cancelar</button>
      </div>
    );
  }

  if (valor) {
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-100 text-xs">
          {valor.tipo === "sharepoint" ? <Cloud className="w-4 h-4 text-primary shrink-0" /> : <FolderOpen className="w-4 h-4 text-primary shrink-0" />}
          <span className="min-w-0 mr-auto">
            <b className="block text-carbon-dark truncate">{nombreDeRuta(valor.ruta) || valor.ruta}</b>
            {valor.tipo === "sharepoint"
              ? <a href={valor.url} target="_blank" rel="noopener noreferrer" className="block truncate text-primary hover:underline">{valor.url}</a>
              : <span className="block truncate text-slate-500">{valor.ruta}</span>}
          </span>
          {puedeEditar && (
            <>
              <button type="button" onClick={() => setEligiendo(true)} disabled={guardando} className={CLASE_SECUNDARIO}>Cambiar</button>
              <button type="button" onClick={() => cambiar(null)} disabled={guardando} className={CLASE_SECUNDARIO}><X className="w-3.5 h-3.5" /> Quitar</button>
            </>
          )}
        </div>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-slate-500">Sin carpeta del proyecto.</p>
      {puedeEditar && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setEligiendo(true)} disabled={guardando} className={CLASE_PRIMARIO}>
            <FolderOpen className="w-3.5 h-3.5" /> Seleccionar carpeta del proyecto
          </button>
          {onOmitir && <button type="button" onClick={onOmitir} className={CLASE_SECUNDARIO}>Omitir</button>}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
};
