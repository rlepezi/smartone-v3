import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ScanSearch, Sparkles } from "lucide-react";
import { revisionIAService } from "../../../services/revisionIAService";
import { leerArbol } from "../../../services/fuentes/carpetaLocal";
import { iniciarEjecucion, obtenerEjecucion, suscribirEjecucion } from "../../../services/fuentes/ejecutorRevision";
import { VistaPreviaValidacion } from "./VistaPreviaValidacion";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO } from "./estilos";
import { formatUsd } from "../../../utils/revisionIA";
import { formatFechaHora } from "../../../utils/fechas";

const contarArchivos = (ejecucion) => {
  const archivos = [...ejecucion.archivos.values()];
  const listos = archivos.filter((a) => ["procesado", "error", "cancelado"].includes(a.estado)).length;
  return { total: archivos.length, listos, errores: archivos.filter((a) => a.estado === "error").length };
};

// Bloque 3 "Validar": lee la carpeta del expediente, muestra la vista previa (personas, archivos,
// costo) y, al confirmar, crea la sesión con origen "expediente" y envía los archivos con el mismo
// ejecutor del módulo. El progreso se ve aquí; al terminar se refresca la matriz.
export const BloqueValidar = ({
  expediente, config, handle, habilitados, puedeValidar, ultimaSesionId, ultimaSesion, onTerminado,
}) => {
  const navigate = useNavigate();
  const [estadoIA, setEstadoIA] = useState(null);
  const [vista, setVista] = useState(null);
  const [omitirValidados, setOmitirValidados] = useState(true);
  const [analizando, setAnalizando] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [error, setError] = useState(null);
  const [sesionId, setSesionId] = useState(null);
  const [progreso, setProgreso] = useState(null);
  const modoEstructura = config?.modoEstructura || "plantilla";
  const libre = modoEstructura === "libre";

  useEffect(() => {
    let vigente = true;
    revisionIAService.estado(expediente.mandanteId)
      .then((e) => { if (vigente) setEstadoIA(e); })
      .catch(() => { if (vigente) setEstadoIA({ configurada: false }); });
    return () => { vigente = false; };
  }, [expediente.mandanteId]);

  // Retoma el progreso si la última sesión del expediente sigue enviándose en esta pestaña.
  useEffect(() => {
    const id = sesionId || ultimaSesionId;
    if (!id || !obtenerEjecucion(id)) return undefined;
    const actualizar = (ejecucion) => {
      setProgreso({ ...contarArchivos(ejecucion), estado: ejecucion.estado, error: ejecucion.error });
      if (ejecucion.estado === "terminada") onTerminado?.();
    };
    actualizar(obtenerEjecucion(id));
    return suscribirEjecucion(id, actualizar);
  }, [sesionId, ultimaSesionId, onTerminado]);

  const iaDisponible = Boolean(estadoIA?.configurada) && estadoIA?.preciosConfigurados !== false;
  const enCurso = progreso?.estado === "en_curso";
  const listo = Boolean(handle) && habilitados > 0 && puedeValidar && !enCurso;

  const analizar = async (leida, omitir) => revisionIAService.analizar({
    mandanteId: expediente.mandanteId, arbol: leida.arbol, modoEstructura,
    expedienteId: expediente.id, requerimientoIds: config?.requerimientosIA || [], omitirValidados: omitir,
  });

  const abrirVistaPrevia = async () => {
    setAnalizando(true);
    setError(null);
    try {
      const leida = await leerArbol(handle);
      setVista({ leida, plan: await analizar(leida, omitirValidados) });
    } catch (err) {
      setError(err.message || "No se pudo leer la carpeta.");
    } finally {
      setAnalizando(false);
    }
  };

  const cambiarOmitir = async (valor) => {
    setOmitirValidados(valor);
    setAnalizando(true);
    try {
      const plan = await analizar(vista.leida, valor);
      setVista((v) => ({ ...v, plan }));
    } catch (err) {
      setError(err.message || "No se pudo actualizar la vista previa.");
    } finally {
      setAnalizando(false);
    }
  };

  const crearSesion = (leida, modo) => revisionIAService.crearSesion({
    mandanteId: expediente.mandanteId,
    nombre: `${leida.carpetaRaizNombre} · ${new Date().toLocaleDateString("es-CL")}`,
    carpetaRaizNombre: leida.carpetaRaizNombre, modo, modoEstructura,
    arbol: leida.arbol, calcesManuales: {}, enlaces: {},
    expedienteId: expediente.id, requerimientoIds: config?.requerimientosIA || [], omitirValidados,
  });

  const confirmar = async () => {
    setIniciando(true);
    setError(null);
    try {
      const { sesion, archivosIA } = await crearSesion(vista.leida, "completitud_ia");
      iniciarEjecucion(sesion.id, archivosIA
        .map((meta) => ({ meta, archivo: vista.leida.archivos.get(meta.rutaRelativa) }))
        .filter((t) => t.archivo));
      setSesionId(sesion.id);
      setVista(null);
    } catch (err) {
      setError(err.message || "No se pudo iniciar la validación.");
    } finally {
      setIniciando(false);
    }
  };

  // Solo completitud (US$0): sin IA, sin evidencias ni evaluaciones; el resultado se ve en la sesión.
  const soloCompletitud = async () => {
    setAnalizando(true);
    setError(null);
    try {
      const leida = await leerArbol(handle);
      const { sesion } = await crearSesion(leida, "completitud");
      navigate(`/revisiones-ia/${sesion.id}`);
    } catch (err) {
      setError(err.message || "No se pudo revisar la completitud.");
      setAnalizando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={abrirVistaPrevia} disabled={!listo || analizando || !iaDisponible} className={CLASE_PRIMARIO}>
          <Sparkles className="w-4 h-4" /> {analizando && !vista ? "Leyendo carpeta..." : "Validar con IA"}
        </button>
        {!libre && (
          <button type="button" onClick={soloCompletitud} disabled={!listo || analizando} className={CLASE_SECUNDARIO}>
            <ScanSearch className="w-3.5 h-3.5" /> Solo revisar completitud (US$0)
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-500">
        "Validar con IA" lee la carpeta y muestra primero la vista previa con la estimación de costo; no se envía nada a la IA hasta confirmar.
      </p>
      {ultimaSesion && ultimaSesion.modo === "completitud_ia" && (
        <p className="text-[11px] text-slate-500">
          Última validación ({formatFechaHora(ultimaSesion.createdAt)}): estimado {formatUsd(ultimaSesion.costoEstimadoUsd, 4)} · real{" "}
          <b className="text-carbon-dark">{ultimaSesion.estado === "en_proceso" ? "en curso" : formatUsd(ultimaSesion.costoRealUsd, 4)}</b>
          {" "}· {ultimaSesion.procesados} de {ultimaSesion.archivos} documentos{ultimaSesion.errores ? `, ${ultimaSesion.errores} con error` : ""}
        </p>
      )}
      {!puedeValidar && <p className="text-[11px] text-slate-400">Validar requiere rol evaluador o superadmin y un expediente no cerrado.</p>}
      {puedeValidar && !listo && !enCurso && (
        <p className="text-[11px] text-slate-400">
          {!handle ? "Requiere la carpeta con acceso concedido (paso 1). " : ""}
          {!habilitados ? "Requiere al menos un requerimiento habilitado (paso 2)." : ""}
        </p>
      )}
      {estadoIA && !iaDisponible && <p className="text-[11px] text-amber-700">La IA no está configurada o faltan los precios del modelo.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {vista?.leida.noLeidos?.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 space-y-1">
          <p className="font-semibold">
            {vista.leida.noLeidos.length === 1 ? "1 archivo no se pudo leer y no se incluye" : `${vista.leida.noLeidos.length} archivos no se pudieron leer y no se incluyen`}.
          </p>
          <p>
            Suele pasar con archivos de OneDrive o SharePoint que están «solo en línea»: en el Explorador, haga clic derecho en la
            carpeta y elija «Mantener siempre en este dispositivo», y vuelva a validar.
          </p>
          <p className="text-amber-700/80 break-all">
            {vista.leida.noLeidos.slice(0, 5).map((a) => a.ruta).join(" · ")}{vista.leida.noLeidos.length > 5 ? " …" : ""}
          </p>
        </div>
      )}

      {progreso && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>
              {enCurso ? "Validando" : progreso.estado === "cancelada" ? "Cancelada" : "Validación terminada"}: {progreso.listos} de {progreso.total} archivos
              {progreso.errores > 0 && <span className="text-red-600"> · {progreso.errores} con error</span>}
            </span>
            {(sesionId || ultimaSesionId) && <Link to={`/revisiones-ia/${sesionId || ultimaSesionId}`} className="font-bold text-primary hover:underline">Ver sesión</Link>}
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progreso.total ? Math.round((progreso.listos / progreso.total) * 100) : 0}%` }} />
          </div>
          {enCurso && <p className="text-[11px] text-slate-400">Mantenga esta pestaña abierta mientras se envían los archivos.</p>}
          {progreso.error && <p className="text-[11px] text-red-600">{progreso.error}</p>}
        </div>
      )}

      {vista && (
        <VistaPreviaValidacion
          plan={vista.plan}
          expedienteId={expediente.id}
          omitirValidados={omitirValidados}
          onOmitirValidados={cambiarOmitir}
          iaDisponible={iaDisponible && !vista.plan.faltanPrecios}
          analizando={analizando}
          iniciando={iniciando}
          onConfirmar={confirmar}
          onCerrar={() => setVista(null)}
        />
      )}
    </div>
  );
};
