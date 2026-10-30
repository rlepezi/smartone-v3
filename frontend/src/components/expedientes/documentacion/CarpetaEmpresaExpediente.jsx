import { useEffect, useState } from "react";
import { Cloud, FolderOpen, KeyRound, Link2Off, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useCarpetaExpediente } from "../../../hooks/useCarpetaExpediente";
import { useCarpetaBase } from "../../../hooks/useCarpetaBase";
import { fuenteDocumentalService } from "../../../services/fuenteDocumentalService";
import { carpetaEmpresaService } from "../../../services/carpetaEmpresaService";
import { repositorioDocumentalService } from "../../../services/repositorioDocumentalService";
import { ConfirmacionModal } from "../../shared/ConfirmacionModal";
import { Toast } from "../../shared/Toast";
import { SelectorCarpetaEmpresa } from "./SelectorCarpetaEmpresa";
import { EstructuraDosNiveles } from "./EstructuraDosNiveles";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO } from "./estilos";
import { ESTADOS_MAPEO } from "../../../utils/estadosMapeo";

const BADGE = "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap";

// Pestaña Documentación de un expediente con Carpeta de empresa (o aún sin carpeta): la subcarpeta de
// la fuente documental del Mandante que representa a la empresa en este proyecto. Muestra ruta,
// empresa, proyecto y estado del mapeo; "Cambiar" elige otra subcarpeta de la fuente (mismo selector
// que Nueva Acreditación) y "Desvincular" la deja libre (conserva su mapeo). Con fuente local, la
// carpeta se abre desde la raíz autorizada en este navegador.
//  - datos: respuesta de repositorioDocumentalService.obtener (origen "carpetaEmpresa" | "ninguna").
//  - puedeConfigurarFuente: enlace a Fuentes documentales cuando el Mandante no tiene fuente.
export const CarpetaEmpresaExpediente = ({ expedienteId, usuarioId, mandanteId, datos, onActualizado, empresa = null, puedeConfigurarFuente = false }) => {
  const repo = datos?.repositorioDocumental || null;
  const ce = datos?.carpetaEmpresa || null;
  const puedeEditar = Boolean(datos?.puedeEditar);
  const [fuente, setFuente] = useState(undefined); // undefined: cargando
  const [cambiando, setCambiando] = useState(false);
  const [confirmarDesvincular, setConfirmarDesvincular] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    fuenteDocumentalService.activa(mandanteId)
      .then((f) => { if (vigente) setFuente(f || null); })
      .catch(() => { if (vigente) setFuente(null); });
    return () => { vigente = false; };
  }, [mandanteId]);

  const base = useCarpetaBase(usuarioId, mandanteId, { etiquetaFuente: fuente?.tipo === "local" ? fuente.etiqueta : null });
  const carpeta = useCarpetaExpediente(usuarioId, expedienteId, {
    onRepositorio: onActualizado, empresa, mandanteId, usaFuente: true,
    rutaFuente: repo?.tipo === "local" ? repo.ruta : null,
    autoVincular: fuente?.tipo === "local", puedeGuardar: puedeEditar,
    // Al autorizar la raíz en este navegador, la carpeta se vuelve a abrir.
    version: base.coincideFuente ? base.permiso || "" : "",
  });

  const recargar = async () => onActualizado(await repositorioDocumentalService.obtener(expedienteId));
  const vincularUrl = async (url) => {
    setError(null);
    try {
      await carpetaEmpresaService.vincular({ expedienteId, url });
      await recargar();
      setCambiando(false);
    } catch (err) {
      setError(err.message || "No se pudo vincular la carpeta.");
    }
  };
  const elegir = async (nombre) => {
    setError(null);
    if (await carpeta.vincularHandle(await base.subcarpeta(nombre))) setCambiando(false);
  };
  const desvincular = async () => {
    setOcupado(true);
    setError(null);
    try {
      await carpetaEmpresaService.desvincular(expedienteId);
      await recargar();
      setConfirmarDesvincular(false);
    } catch (err) {
      setError(err.message || "No se pudo desvincular la carpeta.");
    } finally {
      setOcupado(false);
    }
  };

  const estadoMapeo = ESTADOS_MAPEO[ce?.estadoMapeo] || ESTADOS_MAPEO.sin_mapear;
  const local = repo?.tipo === "local";
  const mostrarSelector = puedeEditar && (!ce || cambiando);

  return (
    <div className="space-y-4">
      {ce ? (
        <div className="p-4 rounded-2xl border border-slate-100 space-y-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 mr-auto">
              <p className="flex items-center gap-2 text-sm font-bold text-carbon-dark">
                {local ? <FolderOpen className="w-4 h-4 text-primary" /> : <Cloud className="w-4 h-4 text-primary" />} {ce.ruta}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {ce.empresaNombre || empresa?.razonSocial || "—"} · {ce.proyectoNombre || "—"}
                {repo?.fuenteEtiqueta && <span className="text-slate-400"> · Fuente: {repo.fuenteEtiqueta}</span>}
              </p>
              {!local && ce.url && (
                <a href={ce.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-primary hover:underline break-all">{ce.url}</a>
              )}
            </div>
            <span className={`${BADGE} ${estadoMapeo.clase}`}>{estadoMapeo.label}</span>
          </div>
          {(ce.carpetaPersonas || ce.carpetaRecursos) && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {[["Carpeta del personal", ce.carpetaPersonas], ["Carpeta de maquinarias", ce.carpetaRecursos]].map(([etiqueta, ruta]) => (
                <div key={etiqueta}><dt className="text-slate-400">{etiqueta}</dt><dd className="font-semibold text-carbon-dark">{ruta || "—"}</dd></div>
              ))}
            </dl>
          )}
          {local && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {carpeta.lista ? (
                <span className="inline-flex items-center gap-1 font-semibold text-sage-dark"><ShieldCheck className="w-4 h-4" /> Abierta en este navegador</span>
              ) : carpeta.faltaRaiz ? (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><ShieldAlert className="w-4 h-4" /> La fuente no está autorizada en este navegador</span>
              ) : carpeta.permiso === "prompt" ? (
                <button type="button" onClick={carpeta.reautorizar} className={CLASE_PRIMARIO}><KeyRound className="w-3.5 h-3.5" /> Permitir acceso</button>
              ) : !carpeta.cargando && (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><ShieldAlert className="w-4 h-4" /> No se pudo abrir la carpeta</span>
              )}
            </div>
          )}
          {carpeta.faltaRaiz && local && fuente?.tipo === "local" && (
            <button type="button" onClick={base.autorizarFuente} className={CLASE_SECUNDARIO}>
              <KeyRound className="w-3.5 h-3.5" /> Autorizar «{fuente.etiqueta}» en este navegador
            </button>
          )}
          {puedeEditar && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => setCambiando((v) => !v)} className={CLASE_SECUNDARIO}>
                <RefreshCw className="w-3.5 h-3.5" /> {cambiando ? "Cancelar cambio" : "Cambiar"}
              </button>
              <button type="button" onClick={() => setConfirmarDesvincular(true)} className={CLASE_SECUNDARIO}>
                <Link2Off className="w-3.5 h-3.5" /> Desvincular
              </button>
            </div>
          )}
          {carpeta.lista && <EstructuraDosNiveles handle={carpeta.handle} />}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Este expediente aún no tiene su carpeta de empresa.{!puedeEditar && " Su rol no puede vincularla."}</p>
      )}
      {mostrarSelector && fuente !== undefined && (
        <SelectorCarpetaEmpresa
          fuente={fuente}
          base={base}
          empresa={empresa}
          seleccionada={ce?.ruta || null}
          onElegir={elegir}
          onElegirUrl={vincularUrl}
          errorSeleccion={error || carpeta.error}
          puedeConfigurarBase={puedeConfigurarFuente}
          autoElegir={false}
        />
      )}
      {!mostrarSelector && (error || carpeta.error) && <p role="alert" className="text-xs text-red-600">{error || carpeta.error}</p>}
      {confirmarDesvincular && (
        <ConfirmacionModal
          titulo="Desvincular la carpeta"
          mensaje={`El expediente deja de usar «${ce?.ruta}». La carpeta y su mapeo se conservan para volver a vincularla; los archivos no se tocan.`}
          textoConfirmar="Desvincular"
          ocupado={ocupado}
          onConfirmar={desvincular}
          onCancelar={() => setConfirmarDesvincular(false)}
        />
      )}
      <Toast mensaje={carpeta.avisoAuto} onCerrar={carpeta.limpiarAvisoAuto} />
    </div>
  );
};
