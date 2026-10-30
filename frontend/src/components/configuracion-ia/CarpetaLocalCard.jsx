import { useCallback, useEffect, useState } from "react";
import { FolderOpen, KeyRound, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  soportaSelectorCarpeta, obtenerCarpetaPredeterminada, guardarCarpetaPredeterminada, estadoPermiso, pedirPermiso,
  seleccionarCarpeta, listarDirectorio,
} from "../../services/fuentes/carpetaLocal";
import { fuenteDocumentalService } from "../../services/fuenteDocumentalService";
import { carpetaEmpresaService } from "../../services/carpetaEmpresaService";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { Tarjeta } from "./Tarjeta";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO } from "./estilos";

const SIN_INDEXEDDB = "Este navegador no permite recordar la carpeta (almacenamiento local no disponible).";
const BADGE = "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border";

// Fuente documental LOCAL del Mandante: la carpeta raíz con una subcarpeta por empresa y proyecto
// (p. ej. «Repositorio Empresas»). En el backend queda solo su nombre (una sola fuente activa por
// Mandante; la registra o cambia solo superadmin). El acceso vive en ESTE navegador (IndexedDB, por
// usuario y Mandante): cada usuario la autoriza en su navegador eligiendo esa misma carpeta.
//  - fuentes: las del Mandante (fuenteDocumentalService.listar); onCambio(): recargarlas.
export const CarpetaLocalCard = ({ usuarioId, mandanteId, mandanteNombre = null, fuentes, esSuperadmin, onCambio }) => {
  const soportado = soportaSelectorCarpeta();
  const local = (fuentes || []).find((f) => f.tipo === "local" && f.estado === "activa") || null;
  const sharepoint = (fuentes || []).find((f) => f.tipo === "sharepoint" && f.estado === "activa") || null;
  const [registro, setRegistro] = useState(null); // raíz recordada en este navegador
  const [permiso, setPermiso] = useState(null);
  const [cargado, setCargado] = useState(!soportado);
  // Carpetas de empresa registradas en la fuente (rutas) y subcarpetas leídas de la raíz en este
  // navegador (incluye las agregadas después: se vuelven a leer con "Actualizar").
  const [registradas, setRegistradas] = useState({ fuenteId: null, rutas: null });
  const [subcarpetas, setSubcarpetas] = useState(null);
  const [lecturas, setLecturas] = useState(0);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [pendienteSharePoint, setPendienteSharePoint] = useState(null); // handle elegido

  const autorizada = Boolean(local && registro && registro.handle.name === local.etiqueta && permiso === "granted");

  // Raíz recordada en este navegador y su permiso (sin tocar el estado).
  const consultarNavegador = useCallback(async () => {
    const reg = await obtenerCarpetaPredeterminada(usuarioId, mandanteId);
    const estado = reg ? await estadoPermiso(reg.handle).catch(() => "prompt") : null;
    return { reg, estado };
  }, [usuarioId, mandanteId]);
  const aplicar = ({ reg, estado }) => {
    setRegistro(reg);
    setPermiso(estado);
  };
  const leerNavegador = async () => aplicar(await consultarNavegador());

  useEffect(() => {
    if (!soportado || !usuarioId || !mandanteId) return undefined;
    let vigente = true;
    consultarNavegador()
      .then((r) => { if (vigente) aplicar(r); })
      .catch(() => { if (vigente) setError(SIN_INDEXEDDB); })
      .finally(() => { if (vigente) setCargado(true); });
    return () => { vigente = false; };
  }, [soportado, usuarioId, mandanteId, consultarNavegador]);

  // Carpetas de empresa registradas en la fuente local activa.
  const fuenteLocalId = local?.id || null;
  useEffect(() => {
    if (!fuenteLocalId) return undefined;
    let vigente = true;
    carpetaEmpresaService.listar({ mandanteId, fuenteId: fuenteLocalId })
      .then((lista) => { if (vigente) setRegistradas({ fuenteId: fuenteLocalId, rutas: (lista || []).map((c) => c.ruta.toLowerCase()) }); })
      .catch(() => { if (vigente) setRegistradas({ fuenteId: fuenteLocalId, rutas: null }); });
    return () => { vigente = false; };
  }, [mandanteId, fuenteLocalId, lecturas]);

  // Subcarpetas de primer nivel de la raíz autorizada (todas, registradas o no).
  const raizAutorizada = autorizada ? registro.handle : null;
  useEffect(() => {
    if (!raizAutorizada) return undefined;
    let vigente = true;
    listarDirectorio(raizAutorizada, "")
      .then((l) => { if (vigente) setSubcarpetas((l?.carpetas || []).map((c) => c.nombre)); })
      .catch(() => { if (vigente) setSubcarpetas(null); });
    return () => { vigente = false; };
  }, [raizAutorizada, lecturas]);
  const rutasRegistradas = registradas.fuenteId === local?.id ? registradas.rutas : null;
  const sinRegistrar = subcarpetas && rutasRegistradas ? subcarpetas.filter((n) => !rutasRegistradas.includes(n.toLowerCase())) : null;

  const recordar = async (handle) => {
    await guardarCarpetaPredeterminada(usuarioId, mandanteId, handle);
    await leerNavegador();
  };

  // Registra `handle` como fuente local del Mandante (superadmin) y la recuerda aquí. Con SharePoint
  // activo, el backend rechaza: se pide confirmación explícita para desactivarlo.
  const registrar = async (handle) => {
    setError(null);
    setAviso(null);
    setTrabajando(true);
    try {
      await fuenteDocumentalService.guardarLocal(mandanteId, handle.name);
      await recordar(handle);
      setAviso(`«${handle.name}» quedó como fuente documental del Mandante.`);
      onCambio?.();
    } catch (err) {
      if (err.codigo === "SHAREPOINT_ACTIVA") setPendienteSharePoint(handle);
      else setError(err.message || "No se pudo registrar la fuente.");
    } finally {
      setTrabajando(false);
    }
  };

  const desactivarSharePointYRegistrar = async () => {
    setTrabajando(true);
    setError(null);
    try {
      await fuenteDocumentalService.desactivar(sharepoint.id);
      const handle = pendienteSharePoint;
      setPendienteSharePoint(null);
      await registrar(handle);
    } catch (err) {
      setError(err.message || "No se pudo desactivar SharePoint.");
      setPendienteSharePoint(null);
    } finally {
      setTrabajando(false);
    }
  };

  const elegir = async () => (await seleccionarCarpeta(registro?.handle || null).catch(() => null)) || null;

  // Autoriza en este navegador la carpeta ya registrada (debe ser la misma).
  const vincularEnNavegador = async () => {
    setError(null);
    const handle = await elegir();
    if (!handle) return;
    if (handle.name !== local.etiqueta) {
      setError(`Elija la carpeta «${local.etiqueta}» (la fuente del Mandante); eligió «${handle.name}».`);
      return;
    }
    try {
      await recordar(handle);
    } catch {
      setError(SIN_INDEXEDDB);
    }
  };

  const reautorizar = async () => {
    setError(null);
    if (await pedirPermiso(registro.handle).catch(() => false)) await leerNavegador();
    else setError("El navegador no concedió el acceso a la carpeta.");
  };

  const cambiar = async () => {
    const handle = await elegir();
    if (handle && handle.name !== local?.etiqueta) await registrar(handle);
  };
  const nueva = async () => {
    const handle = await elegir();
    if (handle) await registrar(handle);
  };

  return (
    <Tarjeta
      titulo="Carpeta local"
      Icono={FolderOpen}
      subtitulo={mandanteNombre ? `Mandante: ${mandanteNombre}` : null}
      acciones={local
        ? <span className={`${BADGE} bg-sage-lighter text-sage-darker border-sage-light`}>Activa</span>
        : <span className={`${BADGE} bg-slate-100 text-slate-500 border-slate-200`}>{sharepoint ? "No es la fuente activa" : "No configurada"}</span>}
    >
      <p className="text-[11px] text-slate-500">
        La carpeta raíz contiene una subcarpeta por empresa y proyecto (por ejemplo, «Repositorio Empresas»). En SmartOne
        queda solo su nombre; el navegador recuerda el acceso en este equipo y pide confirmarlo con un clic.
      </p>
      {!soportado ? (
        <p className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600">Este navegador no permite leer carpetas locales (use Chrome o Edge).</p>
      ) : !cargado ? (
        <div className="h-16 rounded-xl bg-slate-50 animate-pulse" aria-hidden="true" />
      ) : local ? (
        <div className="p-4 rounded-xl border border-slate-100 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-bold text-carbon-dark mr-auto">{local.etiqueta}</p>
            {autorizada ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-sage-dark"><ShieldCheck className="w-4 h-4" /> Autorizada en este navegador</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><ShieldAlert className="w-4 h-4" /> No autorizada en este navegador</span>
            )}
          </div>
          {rutasRegistradas && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              {subcarpetas && <span><b className="text-carbon-dark">{subcarpetas.length}</b> {subcarpetas.length === 1 ? "carpeta" : "carpetas"} en la fuente</span>}
              <span><b className="text-sage-darker">{rutasRegistradas.length}</b> {rutasRegistradas.length === 1 ? "registrada" : "registradas"}</span>
              {sinRegistrar && <span><b className={sinRegistrar.length ? "text-amber-700" : "text-carbon-dark"}>{sinRegistrar.length}</b> sin registrar</span>}
              {autorizada && (
                <button type="button" onClick={() => setLecturas((n) => n + 1)} className="inline-flex items-center gap-1 font-bold text-primary hover:underline">
                  <RefreshCw className="w-3 h-3" /> Actualizar
                </button>
              )}
            </div>
          )}
          {sinRegistrar?.length > 0 && (
            <p className="text-[11px] text-slate-500">
              Sin registrar: {sinRegistrar.slice(0, 6).join(" · ")}{sinRegistrar.length > 6 ? ` y ${sinRegistrar.length - 6} más` : ""}.
              {esSuperadmin && " Se registran en Mapeo documental."}
            </p>
          )}
          {registro && registro.handle.name !== local.etiqueta && (
            <p className="text-[11px] text-amber-700">En este navegador está recordada «{registro.handle.name}», que no es la fuente.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {(!registro || registro.handle.name !== local.etiqueta) && (
              <button type="button" onClick={vincularEnNavegador} disabled={trabajando} className={CLASE_PRIMARIO}><FolderOpen className="w-4 h-4" /> Vincular carpeta</button>
            )}
            {registro && registro.handle.name === local.etiqueta && permiso !== "granted" && (
              <button type="button" onClick={reautorizar} disabled={trabajando} className={CLASE_PRIMARIO}><KeyRound className="w-4 h-4" /> Re-autorizar</button>
            )}
            {esSuperadmin && (
              <button type="button" onClick={cambiar} disabled={trabajando} className={CLASE_SECUNDARIO}><RefreshCw className="w-4 h-4" /> Cambiar</button>
            )}
          </div>
        </div>
      ) : esSuperadmin ? (
        <div className="space-y-2">
          {sharepoint && <p className="text-xs text-slate-600">El Mandante usa SharePoint («{sharepoint.nombre}») como fuente documental.</p>}
          <div className="flex flex-wrap gap-2">
            {registro && (
              <button type="button" onClick={() => registrar(registro.handle)} disabled={trabajando} className={CLASE_PRIMARIO}>
                Registrar «{registro.handle.name}» como fuente
              </button>
            )}
            <button type="button" onClick={nueva} disabled={trabajando} className={registro ? CLASE_SECUNDARIO : CLASE_PRIMARIO}>
              <FolderOpen className="w-4 h-4" /> {sharepoint ? "Usar una carpeta local" : "Vincular carpeta"}
            </button>
          </div>
          {registro && <p className="text-[11px] text-slate-400">Este navegador ya tenía «{registro.handle.name}» como carpeta principal: puede registrarla tal cual.</p>}
        </div>
      ) : (
        <p className="py-4 text-center text-xs text-slate-400">El Mandante no tiene una carpeta local como fuente. Solo un superadmin la configura.</p>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {aviso && <p role="status" className="text-xs font-semibold text-sage-dark">{aviso}</p>}
      {pendienteSharePoint && (
        <ConfirmacionModal
          titulo="Desactivar SharePoint y usar carpeta local"
          mensaje={`El Mandante tiene SharePoint («${sharepoint?.nombre}») como fuente activa y solo puede haber una. Se desactivará SharePoint (su configuración se conserva) y «${pendienteSharePoint.name}» quedará como fuente. Queda registrado en la Bitácora.`}
          textoConfirmar="Desactivar SharePoint y usar carpeta local"
          ocupado={trabajando}
          onConfirmar={desactivarSharePointYRegistrar}
          onCancelar={() => setPendienteSharePoint(null)}
        />
      )}
    </Tarjeta>
  );
};
