import { useState } from "react";
import { Eye, FlaskConical, FolderOpen, Trash2, Upload, X } from "lucide-react";
import { reglaIAService } from "../../../services/reglaIAService";
import { personaService } from "../../../services/personaService";
import { recursoService } from "../../../services/recursoService";
import {
  EXTENSIONES_ACEPTADAS, MAX_BYTES_ARCHIVO, MIME_DOCX, listarDirectorio, obtenerArchivo, prepararArchivo,
  seleccionarCarpeta, soportaSelectorCarpeta,
} from "../../../services/fuentes/carpetaLocal";
import { SelectorCarpeta } from "../../expedientes/documentacion/SelectorCarpeta";
import { VisorArchivo } from "../../expedientes/documentacion/VisorArchivo";
import { ErrorBanner } from "../../shared/ErrorBanner";
import { SelectConBusqueda } from "../../shared/SelectConBusqueda";
import { dmaAIso, fechaDMA } from "../../../utils/reglasIA";
import { CLASE_INPUT, CLASE_LABEL, CLASE_PRIMARIO, CLASE_SECUNDARIO } from "../../configuracion-ia/estilos";
import { ResultadoPrueba } from "./ResultadoPrueba";

// Mismo tope que el backend: 15 MB entre todos los archivos (en base64 quedan bajo los 25 MB de la API).
const MAX_BYTES_TOTAL = 15 * 1024 * 1024;
const MAX_ARCHIVOS = 6;
const MIMES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf", docx: MIME_DOCX };
const extension = (nombre) => (nombre.includes(".") ? nombre.split(".").pop().toLowerCase() : "");
const mb = (bytes) => `${(bytes / 1024 / 1024).toLocaleString("es-CL", { maximumFractionDigits: 1 })} MB`;

const CAMPOS_CONTEXTO = {
  rut: { etiqueta: "RUT del sujeto", placeholder: "11.111.111-1" },
  nombre: { etiqueta: "Nombre completo", placeholder: "Nombre y apellidos" },
  patente: { etiqueta: "Patente", placeholder: "BBCD12" },
  rutEmpresa: { etiqueta: "RUT de la empresa", placeholder: "76.000.000-0" },
  fechaEvaluacion: { etiqueta: "Fecha de evaluación", placeholder: "dd/mm/aaaa", fecha: true },
  fechaTerminoProyecto: { etiqueta: "Fecha de término del proyecto", placeholder: "dd/mm/aaaa", fecha: true },
};

const hoyDMA = () => fechaDMA(new Date().toISOString());

// "Probar reglas": 1 o más archivos del MISMO sujeto (anverso y reverso) desde una carpeta o subidos a
// mano (no se guardan), y el contexto (a mano o desde una persona o maquinaria). Una sola llamada al
// modelo en Cloud Functions; la prueba queda registrada con su costo.
export const ProbarReglasModal = ({ config, verificaciones, onProbada, onCerrar }) => {
  const { requerimiento, tipo, vinculos } = config;
  const entidad = requerimiento.tipoEntidad;
  // Contexto que piden las reglas determinísticas activas (siempre la fecha de evaluación).
  const clavesContexto = [...new Set(["fechaEvaluacion", ...vinculos
    .filter((v) => v.activa && v.regla?.tipo === "deterministica")
    .flatMap((v) => verificaciones.find((x) => x.clave === v.regla.verificacion)?.contexto || [])])];
  const [contexto, setContexto] = useState({ fechaEvaluacion: hoyDMA() });
  const [archivos, setArchivos] = useState([]); // [{ id, file, rutaRelativa }]
  const [vista, setVista] = useState(null); // File en el visor
  const [carpeta, setCarpeta] = useState(null); // { handle, ruta, listado }
  const [eligiendoSub, setEligiendoSub] = useState(false);
  const [sujetos, setSujetos] = useState(null);
  const [error, setError] = useState(null);
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState(null);

  const agregar = (file, rutaRelativa = null) => {
    if (!EXTENSIONES_ACEPTADAS.includes(extension(file.name))) {
      setError(`${file.name}: use PDF, JPG, PNG, WebP o Word .docx.`);
      return;
    }
    setArchivos((a) => (a.length >= MAX_ARCHIVOS || a.some((x) => x.file.name === file.name && x.rutaRelativa === rutaRelativa) ? a
      : [...a, { id: `${rutaRelativa || ""}/${file.name}/${file.size}`, file, rutaRelativa }]));
  };

  const abrirCarpeta = async () => {
    setError(null);
    const handle = await seleccionarCarpeta().catch(() => null);
    if (!handle) return;
    setCarpeta({ handle, ruta: "", listado: await listarDirectorio(handle, "") });
  };
  const usarSubcarpeta = async (ruta) => {
    setEligiendoSub(false);
    setCarpeta((c) => ({ ...c, ruta, listado: null }));
    const listado = await listarDirectorio(carpeta.handle, ruta);
    setCarpeta((c) => ({ ...c, listado }));
  };
  const deCarpeta = async (meta, accion) => {
    const file = await obtenerArchivo(carpeta.handle, meta.ruta);
    if (!file) { setError(`No se pudo leer ${meta.nombre}.`); return; }
    if (accion === "ver") setVista(file);
    else agregar(file, meta.ruta);
  };

  const cargarSujetos = async () => {
    try {
      const lista = entidad === "recurso" ? await recursoService.listar("activo") : await personaService.listar("activo");
      setSujetos(lista || []);
    } catch (err) {
      setError(err.message || "No se pudo cargar la lista.");
    }
  };
  const elegirSujeto = (id) => {
    const s = (sujetos || []).find((x) => x.id === id);
    if (!s) return;
    setContexto((c) => (entidad === "recurso"
      ? { ...c, patente: s.patente || "" }
      : { ...c, rut: s.rut || "", nombre: `${s.nombre || ""} ${s.apellido || ""}`.trim() }));
  };

  const probar = async () => {
    setError(null);
    const ctx = {};
    for (const k of clavesContexto) {
      const v = String(contexto[k] || "").trim();
      if (!v) continue;
      if (CAMPOS_CONTEXTO[k]?.fecha) {
        const iso = dmaAIso(v);
        if (!iso) { setError(`${CAMPOS_CONTEXTO[k].etiqueta}: use dd/mm/aaaa.`); return; }
        ctx[k] = iso;
      } else {
        ctx[k] = v;
      }
    }
    setProbando(true);
    try {
      const piezas = [];
      for (const a of archivos) {
        const partes = await prepararArchivo({ archivo: a.file, mime: MIMES[extension(a.file.name)] });
        partes.forEach((p) => piezas.push({ nombre: a.file.name, rutaRelativa: a.rutaRelativa, mime: p.mime, contenidoBase64: p.contenidoBase64, parte: p.parte }));
      }
      const pesos = piezas.map((p) => Math.floor((p.contenidoBase64.length * 3) / 4));
      const grande = piezas.find((p, i) => pesos[i] > MAX_BYTES_ARCHIVO);
      if (grande) throw new Error(`${grande.nombre} supera los 10 MB aun después de optimizarlo.`);
      if (pesos.reduce((s, x) => s + x, 0) > MAX_BYTES_TOTAL) throw new Error("Los archivos suman más de 15 MB; pruebe con menos archivos.");
      if (piezas.length > MAX_ARCHIVOS) throw new Error(`Máximo ${MAX_ARCHIVOS} imágenes por prueba (un Word aporta una por imagen).`);
      if (!piezas.length) throw new Error("El Word no trae imágenes que revisar.");
      const resultado = await reglaIAService.probar(requerimiento.id, { archivos: piezas, contexto: ctx });
      setPrueba(resultado);
      onProbada?.(resultado);
    } catch (err) {
      setError(err.message || "No se pudo probar.");
    } finally {
      setProbando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={() => !probando && onCerrar()}>
      <div role="dialog" aria-modal="true" aria-labelledby="probar-reglas-titulo" onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-dropdown w-full max-w-5xl max-h-[92vh] flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <FlaskConical className="w-5 h-5 text-primary" />
          <div className="min-w-0 mr-auto">
            <h3 id="probar-reglas-titulo" className="text-sm font-bold text-carbon-dark">Probar reglas</h3>
            <p className="text-[11px] text-slate-500">{requerimiento.nombreCorto || requerimiento.nombre}{tipo ? ` · ${tipo.nombre}` : ""}</p>
          </div>
          <button type="button" onClick={onCerrar} disabled={probando} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 disabled:opacity-50"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
          <ErrorBanner message={error} />
          {prueba ? (
            <>
              <ResultadoPrueba prueba={prueba} campos={prueba.camposSolicitados || tipo?.campos || config.camposIA || []} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setPrueba(null)} className={CLASE_SECUNDARIO}>Probar otra vez</button>
                <button type="button" onClick={onCerrar} className={CLASE_PRIMARIO}>Listo</button>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="space-y-4">
                <div>
                  <span className={CLASE_LABEL}>Archivos del mismo sujeto (anverso y reverso, hasta {MAX_ARCHIVOS})</span>
                  <div className="flex flex-wrap gap-2">
                    <label className={`${CLASE_SECUNDARIO} cursor-pointer`}>
                      <Upload className="w-3.5 h-3.5" /> Subir archivos
                      <input type="file" multiple className="sr-only" accept={EXTENSIONES_ACEPTADAS.map((e) => `.${e}`).join(",")}
                        onChange={(e) => { [...(e.target.files || [])].forEach((f) => agregar(f)); e.target.value = ""; }} />
                    </label>
                    {soportaSelectorCarpeta() && (
                      <button type="button" onClick={abrirCarpeta} className={CLASE_SECUNDARIO}><FolderOpen className="w-3.5 h-3.5" /> Desde una carpeta</button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Los archivos no se guardan: se optimizan en el navegador (imágenes a 1568 px) y se envían una sola vez. Máximo 10 MB por archivo.</p>
                </div>

                {carpeta && (
                  <div className="rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 text-[11px]">
                      <span className="font-bold text-carbon-dark truncate">{carpeta.handle.name}{carpeta.ruta ? `/${carpeta.ruta}` : ""}</span>
                      <button type="button" onClick={() => setEligiendoSub(true)} className="ml-auto font-bold text-primary hover:underline whitespace-nowrap">Cambiar subcarpeta</button>
                    </div>
                    <ul className="max-h-48 overflow-y-auto divide-y divide-slate-50">
                      {!carpeta.listado ? <li className="px-3 py-2 text-[11px] text-slate-400">Leyendo...</li>
                        : carpeta.listado.archivos.filter((a) => EXTENSIONES_ACEPTADAS.includes(extension(a.nombre))).length === 0
                          ? <li className="px-3 py-2 text-[11px] text-slate-400">Sin archivos compatibles aquí. Use “Cambiar subcarpeta”.</li>
                          : carpeta.listado.archivos.filter((a) => EXTENSIONES_ACEPTADAS.includes(extension(a.nombre))).map((a) => (
                            <li key={a.ruta} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                              <span className="truncate flex-1">{a.nombre}</span>
                              <span className="text-[10px] text-slate-400">{mb(a.tamanoBytes)}</span>
                              <button type="button" onClick={() => deCarpeta(a, "ver")} aria-label={`Ver ${a.nombre}`} className="p-1 text-slate-400 hover:text-primary"><Eye className="w-3.5 h-3.5" /></button>
                              <button type="button" onClick={() => deCarpeta(a, "agregar")} className="text-[11px] font-bold text-primary hover:underline">Agregar</button>
                            </li>
                          ))}
                    </ul>
                  </div>
                )}

                <ul className="space-y-1">
                  {archivos.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 text-xs">
                      <span className="truncate flex-1 font-semibold text-carbon-dark">{a.file.name}</span>
                      <span className={`text-[10px] ${a.file.size > MAX_BYTES_ARCHIVO && extension(a.file.name) === "pdf" ? "text-red-600 font-bold" : "text-slate-400"}`}>{mb(a.file.size)}</span>
                      <button type="button" onClick={() => setVista(a.file)} aria-label={`Ver ${a.file.name}`} className="p-1 text-slate-400 hover:text-primary"><Eye className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => setArchivos((l) => l.filter((x) => x.id !== a.id))} aria-label={`Quitar ${a.file.name}`} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </li>
                  ))}
                </ul>

                <fieldset className="space-y-2">
                  <legend className={CLASE_LABEL}>Contexto de la prueba</legend>
                  {entidad !== "empresa" && (
                    sujetos === null ? (
                      <button type="button" onClick={cargarSujetos} className="text-[11px] font-bold text-primary hover:underline">
                        Cargar desde {entidad === "recurso" ? "una maquinaria" : "una persona"}
                      </button>
                    ) : (
                      <SelectConBusqueda bloque anchoCompleto ariaLabel="Sujeto" value="" onChange={elegirSujeto} textoVacio="Elegir..."
                        options={sujetos.map((s) => ({ value: s.id, label: entidad === "recurso" ? `${s.nombre || ""} · ${s.patente || ""}` : `${s.nombre || ""} ${s.apellido || ""} · ${s.rut || ""}` }))} />
                    )
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {clavesContexto.map((k) => (
                      <label key={k} className="block">
                        <span className="block text-[11px] font-semibold text-gray-600 mb-1">{CAMPOS_CONTEXTO[k]?.etiqueta || k}</span>
                        <input type="text" value={contexto[k] || ""} placeholder={CAMPOS_CONTEXTO[k]?.placeholder}
                          onChange={(e) => setContexto((c) => ({ ...c, [k]: e.target.value }))} className={CLASE_INPUT} />
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400">El contexto no se envía al modelo: solo lo usan las reglas determinísticas.</p>
                </fieldset>
              </div>

              <div className="min-h-[18rem] rounded-xl border border-slate-100 overflow-hidden flex flex-col">
                {vista ? <VisorArchivo archivo={vista} />
                  : <p className="m-auto text-xs text-slate-400 px-6 text-center">Elija “Ver” en un archivo para revisarlo antes de probar.</p>}
              </div>
            </div>
          )}
        </div>

        {!prueba && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
            <span className="mr-auto text-[11px] text-slate-500">Una llamada al modelo; el costo se suma al gasto del mes.</span>
            <button type="button" onClick={onCerrar} disabled={probando} className={CLASE_SECUNDARIO}>Cancelar</button>
            <button type="button" onClick={probar} disabled={probando || !archivos.length} className={CLASE_PRIMARIO}>
              <FlaskConical className="w-3.5 h-3.5" /> {probando ? "Probando..." : "Probar"}
            </button>
          </div>
        )}
      </div>
      {eligiendoSub && carpeta && (
        // El clic en el fondo del selector no debe cerrar también este modal.
        <div onClick={(e) => e.stopPropagation()}>
          <SelectorCarpeta handle={carpeta.handle} rutaInicial={carpeta.ruta} titulo="Elegir la carpeta del sujeto"
            onElegir={usarSubcarpeta} onCerrar={() => setEligiendoSub(false)} />
        </div>
      )}
    </div>
  );
};
