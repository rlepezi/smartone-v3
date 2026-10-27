import { useState } from "react";
import { FileCheck2, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { revisionRequerimientoIAService } from "../../services/revisionRequerimientoIAService";
import { EXTENSIONES_ACEPTADAS, MAX_BYTES_ARCHIVO, MIME_DOCX, prepararArchivo } from "../../services/fuentes/carpetaLocal";
import { usePanelDocumentos } from "./documentacion/panelDocumentosContexto";
import { ResultadoPrueba } from "../requerimientos/reglas-ia/ResultadoPrueba";
import { ErrorBanner } from "../shared/ErrorBanner";

const MAX_BYTES_TOTAL = 15 * 1024 * 1024;
const MAX_ARCHIVOS = 6;
const MIMES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf", docx: MIME_DOCX };
const extension = (nombre) => (nombre.includes(".") ? nombre.split(".").pop().toLowerCase() : "");
const CLASE_BOTON = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors disabled:opacity-50";

// Panel desplegable bajo un requisito con IA habilitada: elige los archivos del sujeto (el abierto en
// el panel Documentos, y opcionalmente otro como el reverso), revisa con las reglas del requerimiento
// (el contexto lo arma el sistema) y muestra la propuesta. "Aplicar propuesta" solo llena el
// formulario; se guarda con "Guardar Evaluación" como siempre. "Descartar" la deja descartada.
export const RevisarConIARequisito = ({ expedienteId, instancia, propuesta, aplicada, onRevisada, onAplicar, onDescartada, onCerrar }) => {
  const { archivoAbierto } = usePanelDocumentos();
  const [archivos, setArchivos] = useState(() => (archivoAbierto ? [{ ...archivoAbierto, origen: "carpeta_local" }] : []));
  const [revisando, setRevisando] = useState(false);
  const [nueva, setNueva] = useState(!propuesta);
  const [error, setError] = useState(null);

  const yaEsta = (file) => archivos.some((a) => a.file.name === file.name && a.file.size === file.size);
  const agregar = (item) => {
    if (!EXTENSIONES_ACEPTADAS.includes(extension(item.file.name))) {
      setError(`${item.file.name}: use PDF, JPG, PNG, WebP o Word .docx.`);
      return;
    }
    if (!yaEsta(item.file) && archivos.length < MAX_ARCHIVOS) setArchivos((l) => [...l, item]);
  };

  const revisar = async () => {
    setRevisando(true);
    setError(null);
    try {
      const piezas = [];
      for (const a of archivos) {
        const partes = await prepararArchivo({ archivo: a.file, mime: MIMES[extension(a.file.name)] });
        partes.forEach((p) => piezas.push({
          nombre: a.file.name, rutaRelativa: a.rutaRelativa || null, mime: p.mime, contenidoBase64: p.contenidoBase64, parte: p.parte,
          ultimaModificacion: a.file.lastModified ? new Date(a.file.lastModified).toISOString() : null,
        }));
      }
      const pesos = piezas.map((p) => Math.floor((p.contenidoBase64.length * 3) / 4));
      const grande = piezas.find((p, i) => pesos[i] > MAX_BYTES_ARCHIVO);
      if (grande) throw new Error(`${grande.nombre} supera los 10 MB aun después de optimizarlo.`);
      if (pesos.reduce((s, x) => s + x, 0) > MAX_BYTES_TOTAL) throw new Error("Los archivos suman más de 15 MB; revise con menos archivos.");
      if (piezas.length > MAX_ARCHIVOS) throw new Error(`Máximo ${MAX_ARCHIVOS} imágenes por revisión (un Word aporta una por imagen).`);
      if (!piezas.length) throw new Error("El Word no trae imágenes que revisar.");
      const revision = await revisionRequerimientoIAService.revisar(expedienteId, {
        expedienteRequerimientoId: instancia.id, archivos: piezas,
        origen: archivos.every((a) => a.origen === "manual") ? "manual" : "carpeta_local",
      });
      setNueva(false);
      onRevisada(revision);
    } catch (err) {
      setError(err.message || "No se pudo revisar con IA.");
    } finally {
      setRevisando(false);
    }
  };

  const descartar = async () => {
    setError(null);
    try {
      await revisionRequerimientoIAService.descartar(propuesta.id);
      setNueva(true);
      onDescartada();
    } catch (err) {
      setError(err.message || "No se pudo descartar.");
    }
  };

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary-lighter/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold text-carbon-dark mr-auto">Revisión IA · {instancia.nombre}</span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar revisión IA" className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
      </div>
      <ErrorBanner message={error} />

      {propuesta && !nueva ? (
        <>
          <ResultadoPrueba prueba={propuesta} />
          {propuesta.observacionesPropuestas && (
            <div>
              <p className="text-[11px] font-bold text-slate-500 mb-1">Observaciones propuestas</p>
              <pre className="whitespace-pre-wrap font-sans text-[11px] text-slate-700 bg-white rounded-lg border border-slate-100 p-2">{propuesta.observacionesPropuestas}</pre>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {aplicada
              ? <span className="text-[11px] font-bold text-sage-darker">Propuesta aplicada al formulario: revise y presione “Guardar Evaluación”.</span>
              : (
                <button type="button" onClick={() => onAplicar(propuesta)} className={`${CLASE_BOTON} bg-primary text-white hover:bg-primary-dark`}>
                  <FileCheck2 className="w-3.5 h-3.5" /> Aplicar propuesta
                </button>
              )}
            <button type="button" onClick={descartar} className={`${CLASE_BOTON} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}>Descartar</button>
            <button type="button" onClick={() => setNueva(true)} className="ml-auto text-[11px] font-bold text-primary hover:underline">Revisar de nuevo</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[11px] text-slate-600">
            Se revisa con las reglas del requerimiento. El contexto (persona o maquinaria, empresa, proyecto y fecha de hoy) lo arma el sistema.
            Puede sumar más de un archivo del mismo sujeto (p. ej. anverso y reverso).
          </p>
          <ul className="space-y-1">
            {archivos.map((a) => (
              <li key={`${a.rutaRelativa || ""}/${a.file.name}`} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-100 text-xs">
                <span className="truncate flex-1 font-semibold text-carbon-dark">{a.file.name}</span>
                <button type="button" onClick={() => setArchivos((l) => l.filter((x) => x !== a))} aria-label={`Quitar ${a.file.name}`} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </li>
            ))}
            {!archivos.length && <li className="text-[11px] text-amber-700">Abra el documento en el panel Documentos (o súbalo aquí) para revisarlo.</li>}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!archivoAbierto || yaEsta(archivoAbierto.file)} onClick={() => agregar({ ...archivoAbierto, origen: "carpeta_local" })}
              title={archivoAbierto ? archivoAbierto.file.name : "No hay un documento abierto en el panel Documentos"}
              className={`${CLASE_BOTON} border border-slate-200 bg-white text-carbon-dark hover:bg-slate-50`}>
              <Plus className="w-3.5 h-3.5" /> Agregar el abierto en Documentos
            </button>
            <label className={`${CLASE_BOTON} border border-slate-200 bg-white text-carbon-dark hover:bg-slate-50 cursor-pointer`}>
              <Upload className="w-3.5 h-3.5" /> Subir archivo
              <input type="file" multiple className="sr-only" accept={EXTENSIONES_ACEPTADAS.map((e) => `.${e}`).join(",")}
                onChange={(e) => { [...(e.target.files || [])].forEach((f) => agregar({ file: f, rutaRelativa: null, origen: "manual" })); e.target.value = ""; }} />
            </label>
            {propuesta && <button type="button" onClick={() => setNueva(false)} className="text-[11px] font-bold text-slate-500 hover:underline">Ver la propuesta actual</button>}
            <button type="button" disabled={revisando || !archivos.length} onClick={revisar} className={`${CLASE_BOTON} ml-auto bg-primary text-white hover:bg-primary-dark`}>
              <Sparkles className="w-3.5 h-3.5" /> {revisando ? "Revisando..." : "Revisar con IA"}
            </button>
          </div>
          <p className="text-[10px] text-slate-400">Los archivos no se guardan; se optimizan en el navegador. Máximo 10 MB por archivo. El costo se suma al gasto IA del mes.</p>
        </>
      )}
    </div>
  );
};
