import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, ChevronDown, ChevronRight, FileText, Folder, Loader2 } from "lucide-react";
import { listarDirectorio, obtenerArchivo } from "../../services/fuentes/carpetaLocal";
import { empresaService } from "../../services/empresaService";
import { VisorArchivo } from "../expedientes/documentacion/VisorArchivo";
import { extraerTextoDocumento } from "../../utils/textoDocumento";
import { prepararPiezasIA, archivoAceptadoIA } from "../../utils/revisionIAArchivos";
import { razonesSocialesCandidatas, rutsCandidatos } from "../../utils/datosEmpresaCarpeta";
import { mimeDe } from "../../utils/loteRevision";
import { formatUsd } from "../configuracion-ia/estilos";

const CHIP = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold transition-colors";

// Rama del árbol de la carpeta, cargada al abrirla.
const Rama = ({ handle, ruta, nivel, abiertos, alternar, contenidos, actual, onAbrir }) => {
  const c = contenidos[ruta];
  if (!c) return <p className="pl-6 py-1 text-[11px] text-slate-400" style={{ paddingLeft: `${nivel * 12 + 12}px` }}>Leyendo...</p>;
  return (
    <ul>
      {c.carpetas.map((s) => (
        <li key={s.ruta}>
          <button type="button" onClick={() => alternar(s.ruta)} style={{ paddingLeft: `${nivel * 12 + 4}px` }}
            className="w-full flex items-center gap-1 py-1 pr-2 text-left text-xs text-slate-700 hover:bg-slate-50">
            {abiertos.has(s.ruta) ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
            <Folder className="w-3.5 h-3.5 shrink-0 text-primary" /><span className="truncate">{s.nombre}</span>
          </button>
          {abiertos.has(s.ruta) && <Rama handle={handle} ruta={s.ruta} nivel={nivel + 1} abiertos={abiertos} alternar={alternar} contenidos={contenidos} actual={actual} onAbrir={onAbrir} />}
        </li>
      ))}
      {c.archivos.map((a) => (
        <li key={a.ruta}>
          <button type="button" onClick={() => onAbrir(a.ruta)} style={{ paddingLeft: `${nivel * 12 + 20}px` }}
            className={`w-full flex items-center gap-1.5 py-1 pr-2 text-left text-xs ${actual === a.ruta ? "bg-primary-lighter font-bold text-carbon-dark" : "text-slate-600 hover:bg-slate-50"}`}>
            <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" /><span className="truncate">{a.nombre}</span>
          </button>
        </li>
      ))}
      {!c.carpetas.length && !c.archivos.length && <li className="py-1 text-[11px] text-slate-400" style={{ paddingLeft: `${nivel * 12 + 12}px` }}>Vacía</li>}
    </ul>
  );
};

// Panel de documentos de la carpeta elegida (Nueva Empresa desde carpeta): árbol por niveles, vista
// previa con VisorArchivo y, del documento abierto, los RUT y razones sociales detectados en su texto
// (clic → al formulario). Con la conexión IA activa, "Extraer datos con IA" (costo estimado antes).
//  - handle: raíz de la fuente local; ruta: carpeta de la empresa; inicial: documento a abrir.
//  - onRut(rut, documento), onRazonSocial(texto, documento): copian al formulario.
//  - onIA(resultado, documento): datos extraídos con IA.
//  - Solo consulta (asistente de acreditación): sin onRut/onRazonSocial los datos detectados no son
//    clicables; `sinIA` oculta la extracción con IA; `titulo` reemplaza la ruta en el encabezado;
//    `abrirCarpeta` despliega esa subcarpeta (y sus padres) cuando cambia.
export const PanelCarpetaEmpresa = ({ handle, ruta, inicial = null, mandanteId, onRut, onRazonSocial, onIA, sinIA = false, titulo = null, abrirCarpeta = null }) => {
  const [contenidos, setContenidos] = useState({});
  const [abiertos, setAbiertos] = useState(new Set());
  const [actual, setActual] = useState(inicial);
  const [archivo, setArchivo] = useState(null);
  const [detectados, setDetectados] = useState(null); // { ruta, ruts, razones, conTexto, paginas }
  const [ia, setIa] = useState(null); // { estimacion } | { ejecutando } | { error }
  const [conexion, setConexion] = useState(null);
  // Subcarpetas ya pedidas (cada una se lee una vez).
  const pedidas = useRef(new Set());

  // Subcarpeta pedida desde fuera: se despliega junto con sus carpetas padre.
  const [carpetaPedida, setCarpetaPedida] = useState(null);
  if (abrirCarpeta !== carpetaPedida) {
    setCarpetaPedida(abrirCarpeta);
    if (abrirCarpeta) {
      const partes = String(abrirCarpeta).split("/").filter(Boolean);
      setAbiertos((s) => new Set([...s, ...partes.map((_, i) => partes.slice(0, i + 1).join("/"))]));
    }
  }

  // Lee cada subcarpeta desplegada la primera vez.
  useEffect(() => {
    abiertos.forEach((r) => {
      if (pedidas.current.has(r)) return;
      pedidas.current.add(r);
      listarDirectorio(handle, r)
        .then((l) => setContenidos((c) => ({ ...c, [r]: { carpetas: l?.carpetas || [], archivos: l?.archivos || [] } })))
        .catch(() => setContenidos((c) => ({ ...c, [r]: { carpetas: [], archivos: [] } })));
    });
  }, [abiertos, handle]);

  useEffect(() => {
    let vigente = true;
    listarDirectorio(handle, ruta)
      .then((l) => { if (vigente) setContenidos((c) => ({ ...c, [ruta]: { carpetas: l?.carpetas || [], archivos: l?.archivos || [] } })); })
      .catch(() => { if (vigente) setContenidos((c) => ({ ...c, [ruta]: { carpetas: [], archivos: [] } })); });
    // La conexión IA (y que haya precios) decide si se muestra el botón.
    if (!sinIA) {
      empresaService.estimarExtraccionIA({ mandanteId, archivos: [] })
        .then((e) => { if (vigente) setConexion(e); })
        .catch(() => { if (vigente) setConexion(null); });
    }
    return () => { vigente = false; };
  }, [handle, ruta, mandanteId, sinIA]);

  // Documento abierto: archivo para el visor y datos detectados en su texto.
  useEffect(() => {
    if (!actual) return undefined;
    let vigente = true;
    obtenerArchivo(handle, actual).then(async (f) => {
      if (!vigente) return;
      setArchivo(f);
      const t = f ? await extraerTextoDocumento(f) : { texto: "", conTexto: false, paginas: null };
      if (!vigente) return;
      setDetectados({ ruta: actual, conTexto: t.conTexto, paginas: t.paginas,
        ruts: rutsCandidatos([{ texto: t.texto }]), razones: razonesSocialesCandidatas(t.texto) });
    });
    return () => { vigente = false; };
  }, [handle, actual]);

  const alternar = (r) => {
    setAbiertos((s) => { const n = new Set(s); if (n.has(r)) n.delete(r); else n.add(r); return n; });
  };
  const abrir = (r) => { setArchivo(null); setDetectados(null); setIa(null); setActual(r); };
  const nombreActual = actual ? actual.split("/").pop() : "";
  const det = detectados?.ruta === actual ? detectados : null;
  const usables = Boolean(onRut || onRazonSocial);

  const estimar = async () => {
    setIa({ estimando: true });
    try {
      const paginas = det?.paginas || undefined;
      const e = await empresaService.estimarExtraccionIA({ mandanteId, archivos: [{ mime: mimeDe(nombreActual), ...(paginas ? { paginas } : {}) }] });
      setIa({ estimacion: e });
    } catch (err) {
      setIa({ error: err.message || "No se pudo estimar el costo." });
    }
  };
  const extraer = async () => {
    setIa({ ejecutando: true });
    try {
      const piezas = await prepararPiezasIA([{ file: archivo, rutaRelativa: actual }]);
      const r = await empresaService.extraerDatosIA({ mandanteId, archivos: piezas });
      setIa(null);
      onIA?.(r, nombreActual);
    } catch (err) {
      setIa({ error: err.message || "No se pudieron extraer los datos." });
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[32rem] rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] flex-1 min-h-0">
        <div className="border-r border-slate-100 overflow-y-auto py-1">
          <p className="px-2 py-1 text-[11px] font-bold text-carbon-dark truncate" title={titulo || ruta}>{titulo || ruta}</p>
          <Rama handle={handle} ruta={ruta} nivel={0} abiertos={abiertos} alternar={alternar} contenidos={contenidos} actual={actual} onAbrir={abrir} />
        </div>
        <div className="flex flex-col min-h-0">
          {det && (det.ruts.length > 0 || det.razones.length > 0) && (
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Datos detectados en el documento{usables ? " (clic para usarlos)" : ""}</p>
              <div className="flex flex-wrap gap-1">
                {det.ruts.map((c) => (
                  <button key={c.rut} type="button" disabled={!usables} onClick={() => onRut?.(c.rut, nombreActual)} title={c.juridico ? "RUT de persona jurídica" : "RUT de persona natural"}
                    className={`${CHIP} ${c.juridico ? "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-100"}`}>
                    RUT {c.rut}{c.veces > 1 ? ` ×${c.veces}` : ""}
                  </button>
                ))}
                {det.razones.slice(0, 6).map((r) => (
                  <button key={r} type="button" disabled={!usables} onClick={() => onRazonSocial?.(r, nombreActual)} className={`${CHIP} bg-sky-50 border-sky-200 text-sky-800 hover:bg-sky-100`}>{r}</button>
                ))}
              </div>
            </div>
          )}
          {!sinIA && det && !det.conTexto && archivo && archivoAceptadoIA(nombreActual) && (
            <p className="px-3 py-1.5 border-b border-slate-100 text-[11px] text-slate-500">Sin texto extraíble (posible escaneo): use «Extraer datos con IA».</p>
          )}
          {!sinIA && conexion?.conexionActiva && !conexion.faltanPrecios && archivo && archivoAceptadoIA(nombreActual) && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-slate-100">
              <button type="button" onClick={estimar} disabled={Boolean(ia?.ejecutando || ia?.estimando)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-primary/30 bg-white text-[11px] font-bold text-primary hover:bg-primary-lighter disabled:opacity-50">
                {ia?.ejecutando || ia?.estimando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                {ia?.ejecutando ? "Extrayendo..." : "Extraer datos con IA"}
              </button>
              <span className="text-[10px] text-slate-400 truncate">Sobre «{nombreActual}»</span>
              {ia?.error && <span className="text-[11px] text-red-600">{ia.error}</span>}
            </div>
          )}
          <div className="flex-1 min-h-0 flex flex-col">
            {!actual ? <p className="m-auto p-6 text-xs text-slate-400">Elija un documento en el árbol.</p>
              : !archivo ? <p className="m-auto flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Leyendo archivo...</p>
                : <VisorArchivo archivo={archivo} onRut={(r) => onRut?.(r, nombreActual)} />}
          </div>
        </div>
      </div>

      {ia?.estimacion && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40" onClick={() => setIa(null)}>
          <div role="dialog" aria-modal="true" aria-label="Extraer datos con IA" onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-dropdown w-full max-w-sm p-5 space-y-3">
            <h3 className="text-sm font-bold text-carbon-dark">Extraer datos con IA</h3>
            <p className="text-xs text-slate-600">
              Se enviará «{nombreActual}» al modelo {ia.estimacion.modelo} para leer razón social, RUT, giro y dirección.
              Costo estimado: <b>{formatUsd(ia.estimacion.costoEstimadoUsd, 4)}</b>. Solo se proponen: nada se guarda hasta que confirme el formulario.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIa(null)} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={extraer} className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark">Extraer</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
