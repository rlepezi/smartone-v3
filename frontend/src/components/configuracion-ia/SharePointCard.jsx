import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, Cloud, Loader2, XCircle } from "lucide-react";
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

// Cuerpo de la concesión de lectura sobre el sitio (Sites.Selected), para la guía de TI.
const CUERPO_PERMISO_SITIO = '{ "roles": ["read"], "grantedToIdentities": [{ "application": { "id": "<Client ID>", "displayName": "SmartOne Connector" } }] }';

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

// Diagnóstico de "Probar conexión": un paso por línea (ok / error / omitido).
const ICONO_PASO = {
  ok: <CheckCircle2 className="w-4 h-4 shrink-0 text-sage-dark" />,
  error: <XCircle className="w-4 h-4 shrink-0 text-red-600" />,
  omitido: <Circle className="w-4 h-4 shrink-0 text-slate-300" />,
};
const Diagnostico = ({ resultado }) => (
  <div role="status" className={`p-3 rounded-xl border text-xs space-y-1.5 ${resultado.ok ? "border-sage-light bg-sage-lighter/40" : "border-red-200 bg-red-50/50"}`}>
    <p className={`font-bold ${resultado.ok ? "text-sage-darker" : "text-red-700"}`}>
      {resultado.ok ? "Conexión exitosa." : "La conexión falló: revise el paso marcado."}
    </p>
    <ul className="space-y-1">
      {resultado.pasos.map((p) => (
        <li key={p.clave} className="flex items-start gap-2">
          {ICONO_PASO[p.estado]}
          <span><b className="text-carbon-dark">{p.titulo}</b>{p.mensaje ? `: ${p.mensaje}` : p.estado === "omitido" ? ": no se probó." : ""}</span>
        </li>
      ))}
    </ul>
  </div>
);

// Fuente SharePoint del Mandante (Microsoft Graph, solo lectura, a través del backend): el secret se
// cifra en el backend y no vuelve a mostrarse. "Probar conexión" valida paso a paso las credenciales,
// el sitio, la biblioteca y la carpeta base, con los datos del formulario (antes de guardar) o con
// la fuente guardada. Guardar sin una prueba exitosa de esos mismos datos pide confirmación. Una
// sola fuente activa por Mandante: con una carpeta local activa, el backend rechaza crear o
// reactivar SharePoint. `onCambio`: tras guardar, probar o cambiar el estado (para recargar la
// fuente activa y las Carpetas de empresa).
export const SharePointCard = ({ mandanteId, mandanteNombre = null, onCambio }) => {
  const [fuente, setFuente] = useState(null);
  const [cargado, setCargado] = useState(false);
  const [datos, setDatos] = useState(VACIO);
  const [reemplazarSecret, setReemplazarSecret] = useState(false);
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmarDesactivar, setConfirmarDesactivar] = useState(false);
  // Última prueba: { firma (datos probados), resultado }; y si se pide confirmar guardar sin ella.
  const [prueba, setPrueba] = useState(null);
  const [probando, setProbando] = useState(false);
  const [confirmarSinPrueba, setConfirmarSinPrueba] = useState(false);

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

  const payloadDe = (d) => ({
    mandanteId, nombre: d.nombre.trim(), tenantId: d.tenantId.trim(), clientId: d.clientId.trim(),
    clientSecret: d.clientSecret.trim() || undefined, siteUrl: d.siteUrl.trim(),
    biblioteca: d.biblioteca.trim(), rutaBase: normalizarRutaBase(d.rutaBase),
  });
  // Firma de lo probado: los datos de conexión (el secret, solo si se escribió uno nuevo).
  const firmaDe = (d) => JSON.stringify({ ...payloadDe(d), nombre: undefined });
  const pruebaVigente = prueba && prueba.firma === firmaDe(datos) ? prueba.resultado : null;

  const probar = async () => {
    setError(null);
    setAviso(null);
    const nuevos = validar(datos, esNueva);
    setErrores(nuevos);
    if (Object.keys(nuevos).length) return;
    setProbando(true);
    try {
      // Sin cambios: se prueba la fuente guardada (deja su estado de conexión).
      const resultado = await fuenteDocumentalService.probarConexion(
        !esNueva && !hayCambios ? { mandanteId, fuenteId: fuente.id } : { ...payloadDe(datos), fuenteId: fuente?.id },
      );
      setPrueba({ firma: firmaDe(datos), resultado });
      if (!esNueva && !hayCambios) onCambio?.();
    } catch (err) {
      setError(err.message || "No se pudo probar la conexión.");
    } finally {
      setProbando(false);
    }
  };

  const guardar = async (e, confirmado = false) => {
    e?.preventDefault?.();
    setError(null);
    setAviso(null);
    const nuevos = validar(datos, esNueva);
    setErrores(nuevos);
    if (Object.keys(nuevos).length) return;
    if (!confirmado && !pruebaVigente?.ok) {
      setConfirmarSinPrueba(true);
      return;
    }
    setConfirmarSinPrueba(false);
    setGuardando(true);
    try {
      const probadaOk = Boolean(pruebaVigente?.ok);
      const payload = payloadDe(datos);
      let guardada = esNueva ? await fuenteDocumentalService.crear(payload) : await fuenteDocumentalService.actualizar(fuente.id, payload);
      // Guardar deja la fuente "sin probar": con la prueba exitosa de estos mismos datos, se prueba
      // la guardada para dejarla "Conectada".
      if (probadaOk && guardada?.estado === "activa") {
        await fuenteDocumentalService.probarConexion({ mandanteId, fuenteId: guardada.id }).catch(() => null);
        guardada = (await fuenteDocumentalService.listar(mandanteId).catch(() => [])).find((f) => f.id === guardada.id) || guardada;
      }
      aplicar(guardada);
      setPrueba(null);
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
  // Formatos (GUID, URL https de *.sharepoint.com): se validan mientras se escribe en los campos
  // con contenido y, al guardar, en todos. Con algún error no se puede guardar.
  const erroresVivos = validar(datos, esNueva);
  const mostrados = { ...Object.fromEntries(Object.entries(erroresVivos).filter(([k]) => String(datos[k] || "").trim())), ...errores };
  const claseDe = (campo) => (mostrados[campo] ? CLASE_INPUT_ERROR : CLASE_INPUT);

  return (
    <Tarjeta
      titulo="SharePoint"
      Icono={Cloud}
      subtitulo={mandanteNombre ? `Mandante: ${mandanteNombre}` : null}
      acciones={<span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.clase}`}>{badge.label}</span>}
    >
      <p className="text-[11px] text-slate-500">
        SmartOne lee los documentos del sitio con permisos de solo lectura (Microsoft Graph): cualquier usuario autorizado los ve
        desde cualquier equipo, sin archivos locales. La estructura se valida con la plantilla activa del Mandante.
      </p>
      {fuente?.estadoConexion === "error" && fuente.ultimoErrorConexion && (
        <p className="text-[11px] text-red-600">Última prueba: {fuente.ultimoErrorConexion}</p>
      )}
      {!cargado ? (
        <div className="h-40 rounded-xl bg-slate-50 animate-pulse" aria-hidden="true" />
      ) : (
        <form onSubmit={guardar} autoComplete="off" className="space-y-4">
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          {aviso && <p role="status" className="text-xs font-semibold text-sage-dark">{aviso}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo id="sp-nombre" etiqueta="Nombre de la fuente *" error={mostrados.nombre}>
              <input id="sp-nombre" autoComplete="off" name="nombre" value={datos.nombre} onChange={cambiar} maxLength={80} placeholder="SharePoint Transemel" className={claseDe("nombre")} />
            </Campo>
            <Campo id="sp-site" etiqueta="URL del sitio *" error={mostrados.siteUrl}>
              <input id="sp-site" autoComplete="off" name="siteUrl" value={datos.siteUrl} onChange={cambiar} placeholder="https://empresa.sharepoint.com/sites/acreditacion" className={claseDe("siteUrl")} />
            </Campo>
            <Campo id="sp-tenant" etiqueta="Tenant ID *" error={mostrados.tenantId}>
              <input id="sp-tenant" autoComplete="off" name="tenantId" value={datos.tenantId} onChange={cambiar} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className={claseDe("tenantId")} />
            </Campo>
            <Campo id="sp-client" etiqueta="Client ID *" error={mostrados.clientId}>
              <input id="sp-client" autoComplete="off" name="clientId" value={datos.clientId} onChange={cambiar} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className={claseDe("clientId")} />
            </Campo>
            <Campo id="sp-secret" etiqueta={`Client secret${esNueva ? " *" : ""}`} error={mostrados.clientSecret} ayuda="Se guarda cifrado y no vuelve a mostrarse.">
              {!esNueva && !reemplazarSecret ? (
                <div className="flex items-center gap-2">
                  <code className="px-2.5 py-2 rounded-lg bg-slate-100 text-xs text-slate-700">••••{fuente.secretUltimos4}</code>
                  <button type="button" onClick={() => setReemplazarSecret(true)} className={CLASE_SECUNDARIO}>Reemplazar</button>
                </div>
              ) : (
                <input id="sp-secret" name="clientSecret" type="password" autoComplete="new-password" value={datos.clientSecret} onChange={cambiar} className={claseDe("clientSecret")} />
              )}
            </Campo>
            <Campo id="sp-biblioteca" etiqueta="Biblioteca de documentos *" error={mostrados.biblioteca}>
              <input id="sp-biblioteca" autoComplete="off" name="biblioteca" value={datos.biblioteca} onChange={cambiar} className={claseDe("biblioteca")} />
            </Campo>
            <Campo id="sp-ruta" etiqueta="Carpeta base (opcional)" ayuda={datos.rutaBase.trim() ? `Se guardará como "${normalizarRutaBase(datos.rutaBase)}"` : "Ej.: Acreditacion/"}>
              <input id="sp-ruta" autoComplete="off" name="rutaBase" value={datos.rutaBase} onChange={cambiar} placeholder="Acreditacion/" className={CLASE_INPUT} />
            </Campo>
          </div>

          <details className="rounded-xl border border-slate-100 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer text-xs font-bold text-carbon-dark select-none">
              <ChevronDown className="w-4 h-4 text-slate-400" /> ¿Cómo obtengo estos datos?
            </summary>
            <p className="px-4 pb-2 text-[11px] text-slate-500">Pasos para el área de TI del cliente (administrador de Microsoft 365):</p>
            <ol className="px-8 pb-3 space-y-1.5 text-[11px] text-slate-600 list-decimal">
              <li>
                <b>Registrar la aplicación.</b> En el portal de Microsoft Entra ID → Registros de aplicaciones → Nuevo registro
                (por ejemplo, «SmartOne Connector»), cuentas de este directorio únicamente. Copie el <b>Id. de directorio (Tenant ID)</b> y
                el <b>Id. de aplicación (Client ID)</b> de la página Información general.
              </li>
              <li>
                <b>Crear el secreto.</b> En Certificados y secretos → Nuevo secreto de cliente. Copie el <b>Valor</b> (no el Id.) apenas se
                cree: después no vuelve a mostrarse. Anote su fecha de expiración para renovarlo a tiempo.
              </li>
              <li>
                <b>Conceder el permiso.</b> En Permisos de API → Agregar un permiso → Microsoft Graph → Permisos de aplicación →
                <b> Sites.Selected</b> (recomendado: solo los sitios autorizados) o <b>Sites.Read.All</b> (todos los sitios, solo lectura).
                Luego, <b>Conceder consentimiento de administrador</b>.
              </li>
              <li>
                <b>Con Sites.Selected, autorizar el sitio.</b> Un administrador concede lectura sobre el sitio específico, por ejemplo con
                Graph Explorer: <code>POST https://graph.microsoft.com/v1.0/sites/{"{siteId}"}/permissions</code> con
                {" "}<code>{CUERPO_PERMISO_SITIO}</code>
                {" "}(o con PowerShell PnP: <code>Grant-PnPAzureADAppSitePermission -Permissions Read</code>).
              </li>
              <li>Ingrese aquí Tenant ID, Client ID, secreto, la URL del sitio, la biblioteca y (opcional) la carpeta base, y presione <b>Probar conexión</b>.</li>
            </ol>
            <p className="px-4 pb-3 text-[11px] text-slate-500">SmartOne solo lee: nunca crea, modifica ni elimina nada en SharePoint.</p>
          </details>

          {pruebaVigente && <Diagnostico resultado={pruebaVigente} />}
          {Object.keys(erroresVivos).length > 0 && hayCambios && (
            <p className="text-[11px] text-slate-500">Para probar o guardar, complete los campos obligatorios (*) con el formato indicado.</p>
          )}
          {hayCambios && !pruebaVigente?.ok && Object.keys(erroresVivos).length === 0 && (
            <p className="text-[11px] text-slate-500">Pruebe la conexión antes de guardar.</p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="submit" disabled={guardando || (!esNueva && !hayCambios) || Object.keys(erroresVivos).length > 0} className={CLASE_PRIMARIO}>
              {guardando ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" onClick={() => aplicar(fuente)} disabled={guardando || !hayCambios} className={CLASE_SECUNDARIO}>Cancelar</button>
            {fuente && (fuente.estado === "activa" ? (
              <button type="button" onClick={() => setConfirmarDesactivar(true)} disabled={guardando} className={CLASE_SECUNDARIO}>Desactivar</button>
            ) : (
              <button type="button" onClick={() => cambiarEstado(true)} disabled={guardando} className={CLASE_SECUNDARIO}>Reactivar</button>
            ))}
            <button type="button" onClick={probar} disabled={probando || guardando || Object.keys(erroresVivos).length > 0 || (fuente?.estado === "inactiva" && !hayCambios)}
              className={`${pruebaVigente?.ok || !hayCambios ? CLASE_SECUNDARIO : CLASE_PRIMARIO} ml-auto`}>
              {probando ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Probando...</> : "Probar conexión"}
            </button>
          </div>
        </form>
      )}
      {confirmarSinPrueba && (
        <ConfirmacionModal
          titulo="Guardar sin una prueba exitosa"
          mensaje={pruebaVigente ? "La última prueba de conexión con estos datos falló. ¿Guardar de todas formas? La fuente quedará con error hasta que la conexión funcione."
            : "Estos datos no se han probado. ¿Guardar de todas formas? La fuente quedará «sin probar» hasta que pruebe la conexión."}
          textoConfirmar="Guardar sin probar"
          ocupado={guardando}
          onConfirmar={() => guardar(null, true)}
          onCancelar={() => setConfirmarSinPrueba(false)}
        />
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
