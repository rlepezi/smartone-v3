import { useEffect, useState } from "react";
import { ChevronDown, Cloud } from "lucide-react";
import { fuenteDocumentalService } from "../../services/fuenteDocumentalService";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { Tarjeta } from "./Tarjeta";
import { CLASE_INPUT, CLASE_INPUT_ERROR, CLASE_LABEL, CLASE_PRIMARIO, CLASE_SECUNDARIO } from "./estilos";

const RE_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_SITE_URL = /^https:\/\/[a-z0-9-]+\.sharepoint\.com\/sites\/[^/?#\s]+\/?$/i;
const VACIO = { nombre: "", tenantId: "", clientId: "", clientSecret: "", siteUrl: "", biblioteca: "Documentos", rutaBase: "" };

const BADGE = {
  no_configurada: { label: "No configurada", clase: "bg-slate-100 text-slate-500 border-slate-200" },
  no_probada: { label: "Configurada, sin probar", clase: "bg-amber-50 text-amber-700 border-amber-200" },
  conectada: { label: "Conectada", clase: "bg-sage-lighter text-sage-darker border-sage-light" },
  error: { label: "Error", clase: "bg-red-50 text-red-700 border-red-200" },
  inactiva: { label: "Inactiva", clase: "bg-slate-100 text-slate-500 border-slate-200" },
};

const normalizarRutaBase = (ruta) => {
  const limpia = String(ruta || "").trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  return limpia ? `${limpia}/` : "";
};

const desdeFuente = (f) => (f ? {
  nombre: f.nombre || "", tenantId: f.config?.tenantId || "", clientId: f.config?.clientId || "", clientSecret: "",
  siteUrl: f.config?.siteUrl || "", biblioteca: f.config?.biblioteca || "Documentos", rutaBase: f.config?.rutaBase || "",
} : VACIO);

const validar = (d, esNueva) => {
  const e = {};
  if (!d.nombre.trim()) e.nombre = "El nombre es obligatorio.";
  else if (d.nombre.trim().length > 80) e.nombre = "Máximo 80 caracteres.";
  if (!RE_GUID.test(d.tenantId.trim())) e.tenantId = "Debe ser un GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).";
  if (!RE_GUID.test(d.clientId.trim())) e.clientId = "Debe ser un GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).";
  if (esNueva && !d.clientSecret.trim()) e.clientSecret = "El client secret es obligatorio.";
  if (!RE_SITE_URL.test(d.siteUrl.trim())) e.siteUrl = "Use https://<tenant>.sharepoint.com/sites/<sitio>.";
  if (!d.biblioteca.trim()) e.biblioteca = "La biblioteca es obligatoria.";
  return e;
};

const Campo = ({ id, etiqueta, error, ayuda, children }) => (
  <div>
    <label htmlFor={id} className={CLASE_LABEL}>{etiqueta}</label>
    {children}
    {error ? <p className="text-[11px] text-red-500 mt-1">{error}</p> : ayuda && <p className="text-[11px] text-slate-400 mt-1">{ayuda}</p>}
  </div>
);

// Fuente SharePoint del Mandante: configuración guardada (secret cifrado en el backend, solo
// escritura). Sin conexión real a Microsoft Graph todavía: "Probar conexión", el árbol y la
// navegación de carpetas llegan con esa conexión. Una sola fuente activa por Mandante: con una
// carpeta local activa, el backend rechaza crear o reactivar SharePoint. `onCambio`: tras guardar o
// cambiar el estado (para recargar la fuente activa y las Carpetas de empresa).
export const SharePointCard = ({ mandanteId, onCambio }) => {
  const [fuente, setFuente] = useState(null);
  const [cargado, setCargado] = useState(false);
  const [datos, setDatos] = useState(VACIO);
  const [reemplazarSecret, setReemplazarSecret] = useState(false);
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmarDesactivar, setConfirmarDesactivar] = useState(false);

  const aplicar = (f) => {
    setFuente(f);
    setDatos(desdeFuente(f));
    setReemplazarSecret(false);
    setErrores({});
  };

  useEffect(() => {
    if (!mandanteId) return undefined;
    let vigente = true;
    fuenteDocumentalService.listar(mandanteId)
      .then((lista) => {
        if (!vigente) return;
        const sharepoint = (lista || []).filter((f) => f.tipo === "sharepoint");
        aplicar(sharepoint.find((f) => f.estado === "activa") || sharepoint[0] || null);
        setError(null);
      })
      .catch((err) => { if (vigente) setError(err.message || "No se pudo cargar la fuente SharePoint."); })
      .finally(() => { if (vigente) setCargado(true); });
    return () => { vigente = false; };
  }, [mandanteId]);

  const cambiar = (e) => {
    const { name, value } = e.target;
    setDatos((d) => ({ ...d, [name]: value }));
    if (errores[name]) setErrores((x) => ({ ...x, [name]: null }));
  };

  const esNueva = !fuente;
  const original = desdeFuente(fuente);
  const hayCambios = JSON.stringify({ ...datos, clientSecret: "" }) !== JSON.stringify({ ...original, clientSecret: "" }) || Boolean(datos.clientSecret.trim());

  const guardar = async (e) => {
    e.preventDefault();
    setError(null);
    setAviso(null);
    const nuevos = validar(datos, esNueva);
    setErrores(nuevos);
    if (Object.keys(nuevos).length) return;
    setGuardando(true);
    try {
      const payload = {
        mandanteId, nombre: datos.nombre.trim(), tenantId: datos.tenantId.trim(), clientId: datos.clientId.trim(),
        clientSecret: datos.clientSecret.trim() || undefined, siteUrl: datos.siteUrl.trim(),
        biblioteca: datos.biblioteca.trim(), rutaBase: normalizarRutaBase(datos.rutaBase),
      };
      aplicar(esNueva ? await fuenteDocumentalService.crear(payload) : await fuenteDocumentalService.actualizar(fuente.id, payload));
      setAviso("Fuente SharePoint guardada.");
      onCambio?.();
    } catch (err) {
      setError(err.message || "No se pudo guardar la fuente.");
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (activar) => {
    setGuardando(true);
    setError(null);
    try {
      aplicar(activar ? await fuenteDocumentalService.reactivar(fuente.id) : await fuenteDocumentalService.desactivar(fuente.id));
      setAviso(activar ? "Fuente reactivada." : "Fuente desactivada.");
      setConfirmarDesactivar(false);
      onCambio?.();
    } catch (err) {
      setError(err.message || "No se pudo cambiar el estado.");
    } finally {
      setGuardando(false);
    }
  };

  const claveBadge = !fuente ? "no_configurada" : fuente.estado === "inactiva" ? "inactiva" : fuente.estadoConexion || "no_probada";
  const badge = BADGE[claveBadge] || BADGE.no_probada;
  const claseDe = (campo) => (errores[campo] ? CLASE_INPUT_ERROR : CLASE_INPUT);

  return (
    <Tarjeta
      titulo="SharePoint"
      Icono={Cloud}
      acciones={<span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.clase}`}>{badge.label}</span>}
    >
      <p className="text-[11px] text-slate-500">
        La estructura se valida con la plantilla activa del mandante. El árbol de carpetas y su navegación estarán disponibles
        cuando exista la conexión con Microsoft Graph; mientras tanto, la carpeta de cada empresa se indica con su URL.
      </p>
      {!cargado ? (
        <div className="h-40 rounded-xl bg-slate-50 animate-pulse" aria-hidden="true" />
      ) : (
        <form onSubmit={guardar} className="space-y-4">
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          {aviso && <p role="status" className="text-xs font-semibold text-sage-dark">{aviso}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo id="sp-nombre" etiqueta="Nombre de la fuente *" error={errores.nombre}>
              <input id="sp-nombre" name="nombre" value={datos.nombre} onChange={cambiar} maxLength={80} placeholder="SharePoint Transemel" className={claseDe("nombre")} />
            </Campo>
            <Campo id="sp-site" etiqueta="URL del sitio *" error={errores.siteUrl}>
              <input id="sp-site" name="siteUrl" value={datos.siteUrl} onChange={cambiar} placeholder="https://empresa.sharepoint.com/sites/acreditacion" className={claseDe("siteUrl")} />
            </Campo>
            <Campo id="sp-tenant" etiqueta="Tenant ID *" error={errores.tenantId}>
              <input id="sp-tenant" name="tenantId" value={datos.tenantId} onChange={cambiar} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className={claseDe("tenantId")} />
            </Campo>
            <Campo id="sp-client" etiqueta="Client ID *" error={errores.clientId}>
              <input id="sp-client" name="clientId" value={datos.clientId} onChange={cambiar} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className={claseDe("clientId")} />
            </Campo>
            <Campo id="sp-secret" etiqueta={`Client secret${esNueva ? " *" : ""}`} error={errores.clientSecret} ayuda="Se guarda cifrado y no vuelve a mostrarse.">
              {!esNueva && !reemplazarSecret ? (
                <div className="flex items-center gap-2">
                  <code className="px-2.5 py-2 rounded-lg bg-slate-100 text-xs text-slate-700">••••{fuente.secretUltimos4}</code>
                  <button type="button" onClick={() => setReemplazarSecret(true)} className={CLASE_SECUNDARIO}>Reemplazar</button>
                </div>
              ) : (
                <input id="sp-secret" name="clientSecret" type="password" autoComplete="off" value={datos.clientSecret} onChange={cambiar} className={claseDe("clientSecret")} />
              )}
            </Campo>
            <Campo id="sp-biblioteca" etiqueta="Biblioteca de documentos *" error={errores.biblioteca}>
              <input id="sp-biblioteca" name="biblioteca" value={datos.biblioteca} onChange={cambiar} className={claseDe("biblioteca")} />
            </Campo>
            <Campo id="sp-ruta" etiqueta="Carpeta base (opcional)" ayuda={datos.rutaBase.trim() ? `Se guardará como "${normalizarRutaBase(datos.rutaBase)}"` : "Ej.: Acreditacion/"}>
              <input id="sp-ruta" name="rutaBase" value={datos.rutaBase} onChange={cambiar} placeholder="Acreditacion/" className={CLASE_INPUT} />
            </Campo>
          </div>

          <details className="rounded-xl border border-slate-100 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer text-xs font-bold text-carbon-dark select-none">
              <ChevronDown className="w-4 h-4 text-slate-400" /> ¿Cómo obtengo estos datos?
            </summary>
            <ol className="px-8 pb-3 space-y-1 text-[11px] text-slate-600 list-decimal">
              <li>En Microsoft Entra ID, registrar una aplicación (por ejemplo, "SmartOne Connector").</li>
              <li>Agregar el permiso de aplicación <b>Sites.Selected</b> (Microsoft Graph) y otorgar consentimiento de administrador.</li>
              <li>Otorgar lectura sobre el sitio con <code>POST https://graph.microsoft.com/v1.0/sites/{"{siteId}"}/permissions</code>, rol <code>read</code>.</li>
              <li>En "Certificados y secretos", crear un client secret y anotar su fecha de expiración.</li>
              <li>Copiar Tenant ID, Client ID y el secret en este formulario.</li>
            </ol>
            <p className="px-4 pb-3 text-[11px] text-slate-500">SmartOne solo solicita acceso de lectura a los sitios que el administrador autorice.</p>
          </details>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="submit" disabled={guardando || (!esNueva && !hayCambios)} className={CLASE_PRIMARIO}>
              {guardando ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" onClick={() => aplicar(fuente)} disabled={guardando || !hayCambios} className={CLASE_SECUNDARIO}>Cancelar</button>
            {fuente && (fuente.estado === "activa" ? (
              <button type="button" onClick={() => setConfirmarDesactivar(true)} disabled={guardando} className={CLASE_SECUNDARIO}>Desactivar</button>
            ) : (
              <button type="button" onClick={() => cambiarEstado(true)} disabled={guardando} className={CLASE_SECUNDARIO}>Reactivar</button>
            ))}
            <span title="Disponible en la próxima versión" className="ml-auto">
              <button type="button" disabled className={CLASE_SECUNDARIO}>Probar conexión</button>
            </span>
          </div>
        </form>
      )}
      {confirmarDesactivar && (
        <ConfirmacionModal
          titulo="Desactivar la fuente SharePoint"
          mensaje="La configuración se conserva y puede reactivarse después."
          textoConfirmar="Desactivar"
          ocupado={guardando}
          onConfirmar={() => cambiarEstado(false)}
          onCancelar={() => setConfirmarDesactivar(false)}
        />
      )}
    </Tarjeta>
  );
};
