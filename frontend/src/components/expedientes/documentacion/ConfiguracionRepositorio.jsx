import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Folder, FolderTree, KeyRound, Link2 } from "lucide-react";
import { validarUrlSharePoint } from "../../../utils/repositorioDocumental";
import { validarCarpetaEmpresa, carpetaDeUrlSharePoint } from "../../../utils/carpetaEmpresa";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO, MENSAJE_SIN_SOPORTE } from "./estilos";
import { ValidacionCarpetaEmpresa } from "./ValidacionCarpetaEmpresa";

const CLASE_INPUT = "w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

// Configurador del repositorio documental (Carpeta local | SharePoint), compartido por la pestaña
// Documentación del expediente (variante "completo") y el asistente Nueva Acreditación ("compacto").
// No guarda nada por sí mismo: quien lo usa decide dónde (API del expediente, o el estado del asistente).
//  - valor: { tipo, etiqueta, url, mapeo } configurado, o null.
//  - carpetaNombre / permiso: carpeta local vinculada en ESTE navegador y su permiso.
//  - onVincular / onReautorizar: requieren un clic del usuario (API del navegador).
//  - onGuardarSharePoint(url): async; la URL ya viene validada.
//  - children: contenido extra de la carpeta local con acceso (p. ej. estructura detectada).
//  - empresa: { razonSocial, nombreFantasia, rut }. Con ella se valida que la carpeta sea de la
//    Empresa (validarCarpetaEmpresa): check verde o advertencia; una URL de SharePoint que no
//    coincide no se puede guardar.
//  - carpetaRechazada: carpeta local elegida que no se guardó por no ser de la Empresa.
export const ConfiguracionRepositorio = ({
  valor, soportado, carpetaNombre, permiso, onVincular, onReautorizar, onGuardarSharePoint, onQuitar,
  puedeEditar = true, variante = "completo", error = null, children = null, empresa = null, carpetaRechazada = null,
}) => {
  const compacto = variante === "compacto";
  const [tipo, setTipo] = useState(valor?.tipo || (soportado ? "local" : "sharepoint"));
  const [url, setUrl] = useState(valor?.tipo === "sharepoint" ? valor.url || "" : "");
  const [errorUrl, setErrorUrl] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const urlRef = useRef(null);

  // Validación contra la Empresa: la carpeta local configurada (o la elegida y rechazada) y la URL
  // de SharePoint escrita (ya con formato válido).
  const nombreLocal = carpetaRechazada || (valor?.tipo === "local" ? valor.etiqueta : null);
  const validacionLocal = empresa && nombreLocal ? validarCarpetaEmpresa(nombreLocal, empresa) : null;
  const urlEscrita = url.trim() && !validarUrlSharePoint(url) ? url.trim() : null;
  const nombreSharePoint = urlEscrita ? carpetaDeUrlSharePoint(urlEscrita) : null;
  const validacionSharePoint = empresa && urlEscrita ? validarCarpetaEmpresa(nombreSharePoint, empresa) : null;
  const sharePointNoCoincide = Boolean(validacionSharePoint && !validacionSharePoint.valida);

  const guardarUrl = async () => {
    const problema = validarUrlSharePoint(url);
    setErrorUrl(problema);
    if (problema || sharePointNoCoincide) return;
    setGuardando(true);
    try {
      await onGuardarSharePoint(url.trim());
    } catch (err) {
      setErrorUrl(err.message || "No se pudo guardar la URL.");
    } finally {
      setGuardando(false);
    }
  };

  const estadoLocal = carpetaNombre
    ? { texto: `Vinculada en este equipo: ${carpetaNombre}`, clase: "text-sage-dark", Icono: CheckCircle2 }
    : valor?.tipo === "local"
      ? { texto: "Configurada pero no vinculada en este equipo", clase: "text-amber-700", Icono: AlertTriangle }
      : { texto: "Sin configurar", clase: "text-slate-500", Icono: Folder };
  const caja = compacto ? "rounded-xl border border-slate-100 p-3 space-y-2" : "rounded-2xl border border-slate-100 p-5 space-y-3";

  return (
    <div className={compacto ? "space-y-2" : "space-y-4"}>
      <fieldset>
        <legend className="block text-xs font-semibold text-gray-700 mb-1.5">Origen</legend>
        <div className="flex flex-wrap gap-2">
          {[{ v: "local", l: "Carpeta local", off: !soportado }, { v: "sharepoint", l: "SharePoint", off: false }].map((o) => (
            <label key={o.v} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs ${o.off ? "border-slate-100 text-slate-400 cursor-not-allowed" : "cursor-pointer"} ${tipo === o.v ? "border-primary bg-primary-lighter/50" : "border-slate-200"}`}>
              <input type="radio" name={`origen-repositorio${compacto ? "-c" : ""}`} checked={tipo === o.v} disabled={o.off || !puedeEditar} onChange={() => setTipo(o.v)} className="text-primary" /> {o.l}
            </label>
          ))}
        </div>
        {!soportado && <p className="text-xs text-amber-700 mt-1.5">{MENSAJE_SIN_SOPORTE}</p>}
      </fieldset>

      {tipo === "local" && soportado && (
        <section className={caja}>
          <p className={`flex items-center gap-1.5 text-sm font-semibold ${estadoLocal.clase}`}><estadoLocal.Icono className="w-4 h-4" /> {estadoLocal.texto}</p>
          {carpetaNombre && valor?.tipo === "local" && valor.etiqueta !== carpetaNombre && (
            <p className="text-[11px] text-amber-700">La carpeta configurada es «{valor.etiqueta}»; en este equipo está vinculada «{carpetaNombre}».</p>
          )}
          <div className="flex flex-wrap gap-2">
            {puedeEditar && (
              <button type="button" onClick={onVincular} className={CLASE_PRIMARIO}>
                <Link2 className="w-4 h-4" /> {carpetaNombre ? "Cambiar carpeta" : "Vincular carpeta"}
              </button>
            )}
            {carpetaNombre && permiso && permiso !== "granted" && (
              <button type="button" onClick={onReautorizar} className={CLASE_SECUNDARIO}><KeyRound className="w-3.5 h-3.5" /> Re-autorizar acceso</button>
            )}
            {puedeEditar && valor && onQuitar && (
              <button type="button" onClick={onQuitar} className={CLASE_SECUNDARIO}>Quitar</button>
            )}
          </div>
          {validacionLocal && (
            <ValidacionCarpetaEmpresa
              nombreCarpeta={nombreLocal}
              resultado={validacionLocal}
              empresaNombre={empresa.razonSocial}
              onElegirOtra={puedeEditar ? onVincular : undefined}
              onQuitar={puedeEditar && onQuitar ? onQuitar : undefined}
            />
          )}
          {!compacto && (
            <p className="text-[11px] text-slate-400">Solo lectura: SmartOne nunca escribe, renombra ni borra archivos. El acceso queda recordado en este navegador; en otro equipo hay que vincularla de nuevo.</p>
          )}
          {!compacto && carpetaNombre && permiso === "granted" && (
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider"><FolderTree className="w-3.5 h-3.5" /> Mapeo de carpetas</h4>
              {[["Carpeta del personal", valor?.mapeo?.carpetaPersonas], ["Carpeta de maquinarias", valor?.mapeo?.carpetaRecursos]].map(([etiqueta, ruta]) => (
                <p key={etiqueta} className="text-xs">
                  <span className="text-slate-500">{etiqueta}: </span>
                  {ruta ? <b className="text-carbon-dark">📁 {ruta}</b> : <span className="italic text-slate-400">Sin asignar</span>}
                </p>
              ))}
              <p className="text-[11px] text-slate-400">Se asigna al elegir personas y maquinarias en Nueva Acreditación.</p>
            </div>
          )}
          {children}
        </section>
      )}

      {tipo === "sharepoint" && (
        <section className={caja}>
          <label htmlFor={`sharepoint-url${compacto ? "-c" : ""}`} className="block text-xs font-semibold text-gray-700">URL de la carpeta en SharePoint</label>
          <input
            id={`sharepoint-url${compacto ? "-c" : ""}`} ref={urlRef} type="url" value={url} disabled={!puedeEditar}
            onChange={(e) => { setUrl(e.target.value); setErrorUrl(null); }}
            placeholder="https://empresa.sharepoint.com/sites/…/Carpeta" className={`${CLASE_INPUT} ${errorUrl ? "border-red-400" : ""}`}
          />
          {errorUrl && <p className="text-xs text-red-600">{errorUrl}</p>}
          <div className="flex flex-wrap gap-2">
            {puedeEditar && (
              <button
                type="button" onClick={guardarUrl} disabled={guardando || !url.trim() || sharePointNoCoincide} className={CLASE_PRIMARIO}
                title={sharePointNoCoincide ? "La carpeta no corresponde a la empresa seleccionada" : undefined}
              >
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            )}
            {valor?.tipo === "sharepoint" && valor.url && (
              <a href={valor.url} target="_blank" rel="noopener noreferrer" className={CLASE_SECUNDARIO}><ExternalLink className="w-3.5 h-3.5" /> Abrir carpeta en SharePoint</a>
            )}
            {puedeEditar && valor?.tipo === "sharepoint" && onQuitar && <button type="button" onClick={onQuitar} className={CLASE_SECUNDARIO}>Quitar</button>}
          </div>
          {validacionSharePoint && (
            <ValidacionCarpetaEmpresa
              nombreCarpeta={nombreSharePoint}
              resultado={validacionSharePoint}
              empresaNombre={empresa.razonSocial}
              onElegirOtra={puedeEditar ? () => { setUrl(""); setErrorUrl(null); urlRef.current?.focus(); } : undefined}
              onQuitar={puedeEditar ? async () => {
                setUrl("");
                setErrorUrl(null);
                if (valor?.tipo === "sharepoint" && onQuitar) await onQuitar();
              } : undefined}
            />
          )}
          <p className="text-[11px] text-slate-500">La vista previa integrada de SharePoint estará disponible en una próxima fase.</p>
        </section>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
};
