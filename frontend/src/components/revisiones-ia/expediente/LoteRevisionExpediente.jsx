import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Bot, CheckCircle2, FileText, KeyRound, Loader2, PlayCircle, RefreshCw, Square, XCircle } from "lucide-react";
import { useCarpetaExpediente } from "../../../hooks/useCarpetaExpediente";
import { listarDirectorio, obtenerArchivo } from "../../../services/fuentes/carpetaLocal";
import { expedienteService } from "../../../services/expedienteService";
import { revisionRequerimientoIAService } from "../../../services/revisionRequerimientoIAService";
import { patronService } from "../../../services/patronService";
import { carpetaUnicaDe } from "../../../utils/carpetasSujetos";
import { prepararPiezasIA } from "../../../utils/revisionIAArchivos";
import {
  ENTIDADES_LOTE, MOTIVOS_LOTE, claveSujeto, contarPaginasPdf, mimeDe, planLote, resumenPlan,
} from "../../../utils/loteRevision";
import { formatUsd } from "../../configuracion-ia/estilos";

const CLASE_BOTON = "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50";
const PRIMARIO = `${CLASE_BOTON} bg-primary text-white hover:bg-primary-dark`;
const SECUNDARIO = `${CLASE_BOTON} border border-slate-200 bg-white text-carbon-dark hover:bg-slate-50`;
const CLASE_BADGE = "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap";

// Lee las carpetas que necesita el plan: las ubicaciones mapeadas de Empresa y la carpeta de cada
// persona o maquinaria (la asignada; si no tiene, la única con su nombre o patente dentro de la
// carpeta del personal o de maquinarias). No escribe nada.
const leerContenidos = async (handle, mapeo, sujetos) => {
  const contenidos = new Map();
  const leer = async (ruta) => {
    if (contenidos.has(ruta)) return contenidos.get(ruta);
    const l = await listarDirectorio(handle, ruta).catch(() => null);
    contenidos.set(ruta, l ? { archivos: l.archivos || [], carpetas: l.carpetas || [] } : null);
    return contenidos.get(ruta);
  };
  for (const entradas of Object.values(mapeo?.requerimientos || {})) {
    for (const e of entradas || []) {
      if (e.tipo !== "archivo") await leer(e.ruta);
    }
  }
  const conCarpeta = new Map();
  for (const s of sujetos) {
    let carpeta = s.carpeta || null;
    if (!carpeta) {
      const raiz = s.tipo === "persona" ? mapeo?.carpetaPersonas : mapeo?.carpetaRecursos;
      const l = raiz ? await leer(raiz) : null;
      carpeta = l ? carpetaUnicaDe(l.carpetas, s.tipo, s)?.ruta || null : null;
    }
    if (carpeta) await leer(carpeta);
    conCarpeta.set(claveSujeto(s.tipo, s.id), { ...s, carpeta });
  }
  return { contenidos, sujetos: conCarpeta };
};

// Páginas de un PDF (para estimar el costo); null si no se pueden contar.
const paginasDe = async (handle, ruta) => {
  try {
    const f = await obtenerArchivo(handle, ruta);
    if (!f) return null;
    return contarPaginasPdf(new TextDecoder("latin1").decode(await f.arrayBuffer()));
  } catch {
    return null;
  }
};

const Modal = ({ titulo, children, onCerrar }) => createPortal(
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={onCerrar}>
    <div role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}
      className="bg-white rounded-2xl shadow-dropdown w-full max-w-lg max-h-[88vh] overflow-y-auto p-5 space-y-3">
      <h3 className="text-sm font-bold text-carbon-dark">{titulo}</h3>
      {children}
    </div>
  </div>,
  document.body,
);

// Revisión en lote del expediente (superadmin y evaluador): arma el plan con el mapeo de la Carpeta
// de empresa y los patrones aprendidos, muestra el resumen con el costo estimado y el límite
// mensual, y revisa uno por uno con el motor de reglas (cada uno deja una propuesta; la IA nunca
// evalúa sola). `carpeta`: la Carpeta de empresa resuelta del expediente; `sujetos`: personas y
// maquinarias activas [{ tipo, id, nombre, apellido, patente, carpeta }].
export const LoteRevisionExpediente = ({ expediente, usuarioId, carpeta, sujetos, onRevisado, onIrADocumentacion }) => {
  const acceso = useCarpetaExpediente(usuarioId, expediente.id, {
    usaFuente: true, rutaFuente: carpeta.ruta, mandanteId: expediente.mandanteId,
  });
  const [plan, setPlan] = useState(null);
  const [seleccion, setSeleccion] = useState(new Set());
  const [preparando, setPreparando] = useState(false);
  const [estimacion, setEstimacion] = useState(null); // { datos, items }
  const [estimando, setEstimando] = useState(false);
  const [progreso, setProgreso] = useState(null); // { total, hechos, ok, errores: [{ nombre, mensaje }], detenido, fin }
  const [error, setError] = useState(null);
  const detener = useRef(false);

  const preparar = async () => {
    setPreparando(true);
    setError(null);
    try {
      const [instancias, estado, patronesPersona, patronesRecurso] = await Promise.all([
        expedienteService.listarRequerimientos(expediente.id, { estado: "activo" }),
        revisionRequerimientoIAService.estado(expediente.id),
        patronService.listar({ mandanteId: expediente.mandanteId, ambito: "persona", objetivo: "archivo", estado: "activo" }).catch(() => []),
        patronService.listar({ mandanteId: expediente.mandanteId, ambito: "recurso", objetivo: "archivo", estado: "activo" }).catch(() => []),
      ]);
      const leidos = await leerContenidos(acceso.handle, carpeta.mapeo, sujetos);
      const nuevo = planLote({
        instancias: instancias || [], habilitados: new Set(estado?.requerimientosHabilitados || []),
        mapeo: carpeta.mapeo, sujetos: leidos.sujetos, contenidos: leidos.contenidos,
        patrones: [...(patronesPersona || []), ...(patronesRecurso || [])],
      });
      setPlan(nuevo);
      setSeleccion(new Set(nuevo.filter((x) => x.estado === "listo").map((x) => x.instanciaId)));
      setProgreso(null);
    } catch (err) {
      setError(err.message || "No se pudo preparar la revisión.");
    } finally {
      setPreparando(false);
    }
  };

  const elegidos = (plan || []).filter((x) => x.estado === "listo" && seleccion.has(x.instanciaId));

  const estimar = async () => {
    setEstimando(true);
    setError(null);
    try {
      const items = [];
      for (const x of elegidos) {
        const archivos = [];
        for (const a of x.archivos) {
          const mime = mimeDe(a.nombre);
          const paginas = mime === "application/pdf" ? await paginasDe(acceso.handle, a.ruta) : null;
          archivos.push({ mime, ...(paginas ? { paginas } : {}) });
        }
        items.push({ expedienteRequerimientoId: x.instanciaId, archivos });
      }
      setEstimacion({ datos: await revisionRequerimientoIAService.estimarLote(expediente.id, items), items: elegidos });
    } catch (err) {
      setError(err.message || "No se pudo estimar el costo.");
    } finally {
      setEstimando(false);
    }
  };

  const ejecutar = async (items) => {
    setEstimacion(null);
    detener.current = false;
    const loteId = `L-${Date.now()}`;
    const estado = { total: items.length, hechos: 0, ok: 0, errores: [], detenido: false, fin: false };
    setProgreso({ ...estado });
    for (const x of items) {
      if (detener.current) { estado.detenido = true; break; }
      const etiqueta = `${x.nombre}${x.sujetoNombre ? ` · ${x.sujetoNombre}` : ""}`;
      try {
        const archivos = [];
        for (const a of x.archivos) {
          const file = await obtenerArchivo(acceso.handle, a.ruta);
          if (!file) throw new Error(`No se encontró ${a.nombre}.`);
          archivos.push({ file, rutaRelativa: a.ruta });
        }
        const piezas = await prepararPiezasIA(archivos);
        await revisionRequerimientoIAService.revisar(expediente.id, {
          expedienteRequerimientoId: x.instanciaId, archivos: piezas, origen: "carpeta_local", lote: true, loteId,
        });
        estado.ok++;
      } catch (err) {
        estado.errores.push({ nombre: etiqueta, mensaje: err.message || "No se pudo revisar." });
        // Límite de gasto alcanzado: no tiene sentido seguir.
        if (/límite de gasto/i.test(err.message || "")) { estado.detenido = true; estado.hechos++; break; }
      }
      estado.hechos++;
      setProgreso({ ...estado, errores: [...estado.errores] });
    }
    setProgreso({ ...estado, errores: [...estado.errores], fin: true });
    onRevisado?.();
  };

  // ── Acceso a la carpeta (fuente del Mandante autorizada en este navegador) ──
  if (!acceso.soportado) return <p className="text-xs text-slate-500">Este navegador no permite leer carpetas locales (use Chrome o Edge).</p>;
  if (acceso.cargando) return <p className="text-xs text-slate-400">Abriendo la carpeta...</p>;
  if (!acceso.lista) {
    return (
      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-2">
        {acceso.faltaRaiz ? (
          <p>La fuente documental del Mandante no está autorizada en este navegador.{" "}
            <button type="button" onClick={onIrADocumentacion} className="font-bold underline">Autorizarla en la pestaña Documentación</button></p>
        ) : (
          <>
            <p>El navegador necesita que confirme el acceso a la carpeta «{carpeta.ruta}».</p>
            <button type="button" onClick={acceso.reautorizar} className={SECUNDARIO}><KeyRound className="w-3.5 h-3.5" /> Re-autorizar</button>
          </>
        )}
        {acceso.error && <p className="text-red-600">{acceso.error}</p>}
      </div>
    );
  }

  const resumen = plan ? resumenPlan(plan) : null;
  const ejecutando = progreso && !progreso.fin;
  const grupos = plan ? Object.keys(ENTIDADES_LOTE).map((entidad) => ({
    entidad, items: plan.filter((x) => x.entidad === entidad),
  })).filter((g) => g.items.length) : [];
  const alternar = (id) => setSeleccion((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-slate-600">
          Carpeta de empresa: <b className="text-carbon-dark">{carpeta.ruta}</b>
          {resumen && <> · <b className="text-carbon-dark">{resumen.totalListos}</b> listos para revisar</>}
        </p>
        <button type="button" onClick={preparar} disabled={preparando || ejecutando} className={plan ? SECUNDARIO : PRIMARIO}>
          {preparando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {preparando ? "Leyendo la carpeta..." : plan ? "Volver a preparar" : "Preparar revisión"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {resumen && Object.keys(resumen.porMotivo).length > 0 && (
        <p className="text-[11px] text-slate-500">
          Fuera del lote: {Object.entries(resumen.porMotivo).map(([m, n]) => `${MOTIVOS_LOTE[m] || m} (${n})`).join(" · ")}.
          {resumen.porMotivo.sin_documento ? " Elija esos documentos en el panel de evaluación y use «Recordar»." : ""}
        </p>
      )}

      {grupos.map((g) => (
        <section key={g.entidad} className="rounded-xl border border-slate-100 overflow-hidden">
          <p className="px-3 py-2 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {ENTIDADES_LOTE[g.entidad]} · {g.items.filter((x) => x.estado === "listo").length} de {g.items.length} listos
          </p>
          <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {g.items.map((x) => (
              <li key={x.instanciaId} className={`flex items-start gap-2 px-3 py-2 text-xs ${x.estado === "listo" ? "" : "bg-slate-50/60"}`}>
                <input type="checkbox" disabled={x.estado !== "listo" || ejecutando} checked={seleccion.has(x.instanciaId)}
                  onChange={() => alternar(x.instanciaId)} aria-label={`Incluir ${x.nombre}`} className="mt-0.5 rounded text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-carbon-dark">{x.nombre}{x.sujetoNombre && <span className="font-normal text-slate-500"> · {x.sujetoNombre}</span>}</p>
                  {x.estado === "listo" ? x.archivos.map((a) => (
                    <p key={a.ruta} className="flex items-center gap-1 text-[11px] text-slate-600 min-w-0" title={a.ruta}><FileText className="w-3 h-3 shrink-0 text-slate-400" /><span className="truncate">{a.nombre}</span></p>
                  )) : <span className={`${CLASE_BADGE} mt-0.5 bg-white text-slate-500 border-slate-200`}>{MOTIVOS_LOTE[x.estado] || x.estado}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {plan && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={estimar} disabled={!elegidos.length || estimando || ejecutando} className={PRIMARIO}>
            {estimando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            {estimando ? "Calculando costo..." : `Revisar seleccionados (${elegidos.length})`}
          </button>
          <span className="text-[11px] text-slate-400">Antes de revisar se muestra el costo estimado y el gasto del mes.</span>
        </div>
      )}

      {progreso && (
        <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
          <div className="flex items-center gap-2 text-xs">
            {ejecutando ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Bot className="w-4 h-4 text-primary" />}
            <span className="font-bold text-carbon-dark mr-auto">
              {ejecutando ? `Revisando ${progreso.hechos + 1} de ${progreso.total}...`
                : `${progreso.detenido ? "Detenido" : "Terminado"}: ${progreso.ok} ${progreso.ok === 1 ? "propuesta" : "propuestas"}, ${progreso.errores.length} con error.`}
            </span>
            {ejecutando && <button type="button" onClick={() => { detener.current = true; }} className={SECUNDARIO}><Square className="w-3 h-3" /> Detener</button>}
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round((progreso.hechos / progreso.total) * 100)}%` }} /></div>
          {progreso.errores.map((e) => (
            <p key={e.nombre} className="flex items-start gap-1 text-[11px] text-red-700"><XCircle className="w-3 h-3 mt-0.5 shrink-0" /> {e.nombre}: {e.mensaje}</p>
          ))}
          {progreso.fin && progreso.ok > 0 && (
            <p className="flex items-center gap-1 text-[11px] text-sage-darker"><CheckCircle2 className="w-3 h-3" /> Las propuestas quedan abajo, en «Propuestas pendientes», para confirmarlas.</p>
          )}
        </div>
      )}

      {estimacion && (
        <Modal titulo="Antes de revisar" onCerrar={() => setEstimacion(null)}>
          <ul className="text-xs text-slate-700 space-y-1">
            {Object.entries(ENTIDADES_LOTE).map(([k, label]) => estimacion.datos.porEntidad[k] > 0 && (
              <li key={k}>{label}: <b>{estimacion.datos.porEntidad[k]}</b> {estimacion.datos.porEntidad[k] === 1 ? "documento" : "documentos"}</li>
            ))}
            <li>Archivos: <b>{estimacion.datos.archivos}</b> · Modelo{estimacion.datos.modelos.length > 1 ? "s" : ""}: {estimacion.datos.modelos.join(", ")}</li>
            <li>Costo estimado: <b>{formatUsd(estimacion.datos.costoEstimadoUsd, 4)}</b></li>
            <li>
              Gasto del mes: {formatUsd(estimacion.datos.gastoMesUsd, 2)}
              {estimacion.datos.limiteMensualUsd !== null
                ? <> de un límite de {formatUsd(estimacion.datos.limiteMensualUsd, 2)} (disponible {formatUsd(estimacion.datos.disponibleUsd, 2)})</>
                : " (sin límite mensual)"}
            </li>
          </ul>
          <p className="text-[11px] text-slate-400">Estimación: un PDF que no se pudo contar se calcula como de 1 página. El consumo queda registrado en el Mandante como «Revisión en lote».</p>
          {estimacion.datos.faltanPrecios.length > 0 && (
            <p className="flex items-start gap-1 text-[11px] text-red-700"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Sin precios configurados para {estimacion.datos.faltanPrecios.join(", ")}: configúrelos en Conexión IA.</p>
          )}
          {!estimacion.datos.alcanza && !estimacion.datos.faltanPrecios.length && (
            <p className="flex items-start gap-1 text-[11px] text-red-700"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> El costo estimado supera lo disponible del límite mensual: reduzca la selección o pida ampliar el límite.</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setEstimacion(null)} className={SECUNDARIO}>Cancelar</button>
            <button type="button" disabled={!estimacion.datos.alcanza} onClick={() => ejecutar(estimacion.items)} className={PRIMARIO}>
              <Bot className="w-3.5 h-3.5" /> Revisar {estimacion.items.length} {estimacion.items.length === 1 ? "documento" : "documentos"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};
