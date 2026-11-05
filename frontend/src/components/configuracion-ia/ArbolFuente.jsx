import { useEffect, useState } from "react";
import { ChevronRight, FileText, Folder, FolderOpen, RefreshCw } from "lucide-react";
import { formatFecha } from "../../utils/fechas";

const formatTamano = (bytes) => (bytes == null ? "" : bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

// Un nivel del árbol: se lee al desplegarlo (lazy).
const Nivel = ({ proveedor, item, profundidad, registrada }) => {
  const [abierto, setAbierto] = useState(false);
  const [hijos, setHijos] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!abierto || hijos) return undefined;
    let vigente = true;
    proveedor.listarHijos(item.id)
      .then((r) => { if (vigente) setHijos(r.hijos || []); })
      .catch((err) => { if (vigente) setError(err.message || "No se pudo leer la carpeta."); });
    return () => { vigente = false; };
  }, [abierto, hijos, proveedor, item.id]);

  const sangria = { paddingLeft: `${profundidad * 16 + 4}px` };
  if (item.tipo !== "carpeta") {
    return (
      <li className="flex items-center gap-1.5 py-1 text-[11px] text-slate-600" style={sangria}>
        <span className="w-3.5" /><FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" />
        <span className="truncate mr-auto">{item.nombre}</span>
        <span className="shrink-0 text-slate-400">{formatTamano(item.tamano)}{item.modificado ? ` · ${formatFecha(item.modificado)}` : ""}</span>
      </li>
    );
  }
  return (
    <li>
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} style={sangria}
        className="w-full flex items-center gap-1.5 py-1 rounded text-left text-xs text-carbon-dark hover:bg-slate-50">
        <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${abierto ? "rotate-90" : ""}`} />
        {abierto ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-primary" /> : <Folder className="w-3.5 h-3.5 shrink-0 text-primary/70" />}
        <span className="truncate mr-auto font-semibold">{item.nombre}</span>
        {registrada !== undefined && (
          registrada
            ? <span className="shrink-0 px-1.5 py-px rounded-full bg-sage-lighter text-sage-darker text-[9px] font-bold">Registrada</span>
            : <span className="shrink-0 px-1.5 py-px rounded-full bg-slate-100 text-slate-500 text-[9px] font-bold">Sin registrar</span>
        )}
      </button>
      {abierto && (
        error ? <p className="text-[11px] text-red-600" style={{ paddingLeft: `${(profundidad + 1) * 16 + 4}px` }}>{error}</p>
          : !hijos ? <p className="text-[11px] text-slate-400" style={{ paddingLeft: `${(profundidad + 1) * 16 + 4}px` }}>Cargando...</p>
            : hijos.length === 0 ? <p className="text-[11px] text-slate-400" style={{ paddingLeft: `${(profundidad + 1) * 16 + 4}px` }}>Carpeta vacía.</p>
              : (
                <ul>{hijos.map((h) => <Nivel key={h.id} proveedor={proveedor} item={h} profundidad={profundidad + 1} />)}</ul>
              )
      )}
    </li>
  );
};

// Árbol real de la fuente documental (navegable, lazy por nivel) con el mismo conteo que la carpeta
// local: carpetas de primer nivel, registradas (en `carpetas`) y sin registrar. Usa el proveedor
// único (crearFuenteDocumental), así no depende del tipo de fuente.
//  - proveedor: crearFuenteDocumental(...).
//  - registradas: carpetas de la fuente (carpetaEmpresaService.listar), o null mientras cargan.
export const ArbolFuente = ({ proveedor, registradas }) => {
  const [raiz, setRaiz] = useState({ version: -1, hijos: null, error: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let vigente = true;
    proveedor.listarHijos(null)
      .then((r) => { if (vigente) setRaiz({ version, hijos: r.hijos || [], error: null }); })
      .catch((err) => { if (vigente) setRaiz({ version, hijos: null, error: err.message || "No se pudo leer la fuente." }); });
    return () => { vigente = false; };
  }, [proveedor, version]);

  const cargando = raiz.version !== version;
  // Registrada: por driveId + itemId (SharePoint vía Graph) o por su ruta/nombre.
  const esRegistrada = (h) => (registradas || []).some((c) => (c.referencia?.itemId && c.referencia.itemId === h.id)
    || String(c.ruta || "").toLowerCase() === String(h.rutaRelativa || h.nombre).toLowerCase());
  const carpetas = (raiz.hijos || []).filter((h) => h.tipo === "carpeta");
  const registradasAqui = carpetas.filter(esRegistrada);
  const sinRegistrar = carpetas.filter((h) => !esRegistrada(h));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
        {raiz.hijos && <span><b className="text-carbon-dark">{carpetas.length}</b> {carpetas.length === 1 ? "carpeta" : "carpetas"} en la fuente</span>}
        {raiz.hijos && registradas && (
          <>
            <span><b className="text-sage-darker">{registradasAqui.length}</b> {registradasAqui.length === 1 ? "registrada" : "registradas"}</span>
            <span><b className={sinRegistrar.length ? "text-amber-700" : "text-carbon-dark"}>{sinRegistrar.length}</b> sin registrar</span>
          </>
        )}
        <button type="button" onClick={() => setVersion((v) => v + 1)} disabled={cargando} className="inline-flex items-center gap-1 font-bold text-primary hover:underline disabled:opacity-50">
          <RefreshCw className="w-3 h-3" /> Actualizar
        </button>
      </div>
      {raiz.error ? <p role="alert" className="text-xs text-red-600">{raiz.error}</p>
        : cargando || !raiz.hijos ? <div className="h-16 rounded-xl bg-slate-50 animate-pulse" aria-hidden="true" />
          : raiz.hijos.length === 0 ? <p className="text-xs text-slate-400">La carpeta base está vacía.</p>
            : (
              <ul className="max-h-96 overflow-y-auto rounded-xl border border-slate-100 p-2">
                {raiz.hijos.map((h) => (
                  <Nivel key={h.id} proveedor={proveedor} item={h} profundidad={0}
                    registrada={h.tipo === "carpeta" && registradas ? esRegistrada(h) : undefined} />
                ))}
              </ul>
            )}
    </div>
  );
};
