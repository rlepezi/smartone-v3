import { useEffect, useRef, useState } from "react";
import { ExternalLink, Maximize2, Search, ZoomIn, ZoomOut } from "lucide-react";
import { rutsEnTexto } from "../../../utils/rutEnTexto";
import { claveTexto } from "../../../utils/carpetasSujetos";
import { esImagen, esPdf, extensionDe } from "../../../utils/repositorioDocumental";
import { VistaPlanilla } from "./VistaPlanilla";

const CLASE_RUT = "rut-detectado bg-amber-100 ring-1 ring-amber-300 rounded px-0.5 cursor-pointer hover:bg-amber-200";
const CLASE_FILA = "fila-persona-encontrada";
const CLASE_MARCA = "busqueda-docx bg-yellow-200";
const ESTILO_FILA = "outline: 2px solid #3f7a5c; background: #e5f2ea;";

// Envuelve en <span> cada RUT válido de los nodos de texto del contenedor.
const marcarRuts = (contenedor) => {
  const walker = document.createTreeWalker(contenedor, NodeFilter.SHOW_TEXT);
  const nodos = [];
  while (walker.nextNode()) nodos.push(walker.currentNode);
  nodos.forEach((nodo) => {
    const ruts = rutsEnTexto(nodo.nodeValue);
    if (!ruts.length) return;
    const fragmento = document.createDocumentFragment();
    let cursor = 0;
    ruts.forEach((r) => {
      fragmento.appendChild(document.createTextNode(nodo.nodeValue.slice(cursor, r.inicio)));
      const span = document.createElement("span");
      span.className = CLASE_RUT;
      span.dataset.rut = r.rut;
      span.title = "Usar este RUT";
      span.textContent = r.texto;
      fragmento.appendChild(span);
      cursor = r.fin;
    });
    fragmento.appendChild(document.createTextNode(nodo.nodeValue.slice(cursor)));
    nodo.parentNode.replaceChild(fragmento, nodo);
  });
};

// Fila de tabla (o párrafo si no hay tablas) que contiene todos los tokens (2+ letras) del nombre.
const ubicarFila = (contenedor, nombre) => {
  contenedor.querySelectorAll(`.${CLASE_FILA}`).forEach((el) => {
    el.classList.remove(CLASE_FILA);
    el.removeAttribute("style");
  });
  const buscados = claveTexto(nombre).split(" ").filter((t) => t.length >= 2);
  if (!buscados.length) return null;
  const candidatos = contenedor.querySelectorAll("tr").length ? contenedor.querySelectorAll("tr") : contenedor.querySelectorAll("p");
  for (const el of candidatos) {
    const tokens = new Set(claveTexto(el.textContent).split(" "));
    if (buscados.every((t) => tokens.has(t))) return el;
  }
  return null;
};

// Quita las marcas de búsqueda anteriores.
const limpiarMarcas = (contenedor) => {
  contenedor.querySelectorAll("mark.busqueda-docx").forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
  contenedor.normalize();
};

const marcarBusqueda = (contenedor, termino) => {
  limpiarMarcas(contenedor);
  const t = termino.trim().toLowerCase();
  if (!t) return 0;
  const walker = document.createTreeWalker(contenedor, NodeFilter.SHOW_TEXT);
  const nodos = [];
  while (walker.nextNode()) nodos.push(walker.currentNode);
  let total = 0;
  nodos.forEach((nodo) => {
    const texto = nodo.nodeValue;
    const minus = texto.toLowerCase();
    if (!minus.includes(t)) return;
    const fragmento = document.createDocumentFragment();
    let cursor = 0;
    let i = minus.indexOf(t);
    while (i >= 0) {
      fragmento.appendChild(document.createTextNode(texto.slice(cursor, i)));
      const mark = document.createElement("mark");
      mark.className = CLASE_MARCA;
      mark.textContent = texto.slice(i, i + t.length);
      fragmento.appendChild(mark);
      total += 1;
      cursor = i + t.length;
      i = minus.indexOf(t, cursor);
    }
    fragmento.appendChild(document.createTextNode(texto.slice(cursor)));
    nodo.parentNode.replaceChild(fragmento, nodo);
  });
  contenedor.querySelector("mark.busqueda-docx")?.scrollIntoView({ block: "center" });
  return total;
};

// Visor de solo lectura de un archivo de la carpeta del expediente (lo usan el modal de "Crear desde
// carpeta" y el panel de documentos): .docx renderizado a HTML con docx-preview (import dinámico),
// PDF en iframe, imágenes con zoom, planillas Excel (.xlsx, .xlsm, .xls) y CSV como tabla (VistaPlanilla); el resto,
// "Abrir en pestaña nueva". En .docx, opcionalmente:
// RUT válidos clickeables (`onRut`) y ubicación de la fila de `nombreBuscado`, con su RUT único como
// sugerencia (`onSugerenciaRut`; nunca se rellena solo).
// `mostrarNombre`: false cuando quien lo usa ya muestra el nombre (panel de documentos).
export const VisorArchivo = ({ archivo, nombreBuscado = "", onRut, onSugerenciaRut, mostrarNombre = true }) => {
  const contenedorRef = useRef(null);
  const [vista, setVista] = useState(null); // { archivo, url }
  const [estado, setEstado] = useState("listo"); // listo | cargando | error
  const [renderizado, setRenderizado] = useState(0);
  const [zoom, setZoom] = useState(null); // null = ajustar
  const [busqueda, setBusqueda] = useState("");
  const [coincidencias, setCoincidencias] = useState(null);
  // PDF grandes (10+ MB): indicador hasta que el iframe termina de cargar; no bloquea el resto.
  const [pdfListo, setPdfListo] = useState(false);
  const nombre = archivo?.name || "";
  const esDocx = extensionDe(nombre) === "docx";
  // Planillas: .xlsx/.xlsm (exceljs), .xls antiguo (SheetJS) y .csv.
  const esPlanilla = ["xlsx", "xlsm", "xls", "csv"].includes(extensionDe(nombre));

  // Otro archivo: zoom y búsqueda vuelven a cero.
  const [archivoPrevio, setArchivoPrevio] = useState(archivo);
  if (archivoPrevio !== archivo) {
    setArchivoPrevio(archivo);
    setZoom(null);
    setBusqueda("");
    setCoincidencias(null);
    setPdfListo(false);
  }

  // Object URL del archivo (para PDF, imagen y "Abrir en pestaña nueva"), revocado al cambiar o cerrar.
  useEffect(() => {
    if (!archivo) return undefined;
    const u = URL.createObjectURL(archivo);
    let vigente = true;
    queueMicrotask(() => { if (vigente) setVista({ archivo, url: u }); });
    return () => {
      vigente = false;
      URL.revokeObjectURL(u);
    };
  }, [archivo]);
  const url = vista?.archivo === archivo ? vista.url : null;

  // .docx → HTML (tablas incluidas), y RUT clickeables.
  useEffect(() => {
    if (!archivo || !esDocx || !contenedorRef.current) return undefined;
    let vigente = true;
    const contenedor = contenedorRef.current;
    contenedor.innerHTML = "";
    setEstado("cargando");
    import("docx-preview")
      .then(({ renderAsync }) => renderAsync(archivo, contenedor, contenedor, {
        inWrapper: false, ignoreWidth: true, ignoreHeight: true, breakPages: false, className: "docx",
      }))
      .then(() => {
        if (!vigente) return;
        marcarRuts(contenedor);
        setEstado("listo");
        setRenderizado((n) => n + 1);
      })
      .catch(() => { if (vigente) setEstado("error"); });
    return () => { vigente = false; };
  }, [archivo, esDocx]);

  // Fila de la persona: se resalta, se hace scroll y, si tiene UN RUT, se sugiere.
  useEffect(() => {
    if (!esDocx || !renderizado || !contenedorRef.current) return;
    const fila = ubicarFila(contenedorRef.current, nombreBuscado);
    if (!fila) {
      onSugerenciaRut?.(null);
      return;
    }
    fila.classList.add(CLASE_FILA);
    fila.setAttribute("style", ESTILO_FILA);
    fila.scrollIntoView({ block: "center" });
    const ruts = [...new Set([...fila.querySelectorAll("[data-rut]")].map((s) => s.dataset.rut))];
    onSugerenciaRut?.(ruts.length === 1 ? ruts[0] : null);
  }, [esDocx, renderizado, nombreBuscado, onSugerenciaRut]);

  const alClickContenedor = (e) => {
    const span = e.target.closest?.("[data-rut]");
    if (span && onRut) onRut(span.dataset.rut);
  };
  const buscar = (valor) => {
    setBusqueda(valor);
    if (!contenedorRef.current) return;
    if (!valor.trim()) {
      limpiarMarcas(contenedorRef.current);
      setCoincidencias(null);
      return;
    }
    setCoincidencias(marcarBusqueda(contenedorRef.current, valor));
  };

  if (!archivo) return <p className="m-auto p-6 text-xs text-slate-400">Elija un archivo para verlo aquí.</p>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-slate-100 bg-white">
        {mostrarNombre ? <span className="text-[11px] font-semibold text-carbon-dark truncate mr-auto" title={nombre}>{nombre}</span> : <span className="mr-auto" />}
        {esDocx && (
          <label className="relative">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="search" value={busqueda} onChange={(e) => buscar(e.target.value)} placeholder="Buscar en el documento" aria-label="Buscar en el documento"
              className="pl-6 pr-2 py-1 w-44 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </label>
        )}
        {esDocx && coincidencias !== null && <span className="text-[10px] text-slate-500 tabular-nums">{coincidencias} coincidencias</span>}
        {esImagen(nombre) && (
          <span className="flex items-center gap-1">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.25, (z || 1) - 0.25))} aria-label="Alejar" className="p-1 rounded hover:bg-slate-100"><ZoomOut className="w-3.5 h-3.5" /></button>
            <span className="text-[10px] text-slate-500 tabular-nums w-9 text-center">{zoom ? `${Math.round(zoom * 100)}%` : "Ajust."}</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(5, (z || 1) + 0.25))} aria-label="Acercar" className="p-1 rounded hover:bg-slate-100"><ZoomIn className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => setZoom(null)} aria-label="Ajustar" title="Ajustar" className="p-1 rounded hover:bg-slate-100"><Maximize2 className="w-3.5 h-3.5" /></button>
          </span>
        )}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
            <ExternalLink className="w-3 h-3" /> Abrir en pestaña nueva
          </a>
        )}
      </div>

      {esDocx ? (
        <div className="flex-1 min-h-0 overflow-auto bg-white">
          {estado === "cargando" && <p className="p-4 text-xs text-slate-400">Abriendo documento...</p>}
          {estado === "error" && <p className="p-4 text-xs text-red-600">No se pudo mostrar este documento Word. Ábralo en una pestaña nueva.</p>}
          <div ref={contenedorRef} onClick={alClickContenedor} className="visor-docx p-3 text-[13px] [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:px-1" />
        </div>
      ) : esPlanilla ? (
        <VistaPlanilla archivo={archivo} />
      ) : esPdf(nombre) ? (
        <div className="relative flex-1 min-h-[20rem] flex flex-col">
          {(!url || !pdfListo) && (
            <p className="absolute inset-0 flex items-center justify-center gap-2 bg-white/80 text-xs text-slate-500">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-hidden="true" /> Cargando PDF...
            </p>
          )}
          {url && <iframe title={nombre} src={url} onLoad={() => setPdfListo(true)} className="flex-1 w-full bg-white" />}
        </div>
      ) : esImagen(nombre) ? (
        <div className="flex-1 min-h-0 overflow-auto bg-slate-50 p-2">
          <img src={url || undefined} alt={nombre} style={zoom ? { width: `${zoom * 100}%`, maxWidth: "none" } : { maxWidth: "100%" }} className="block mx-auto" />
        </div>
      ) : (
        <div className="m-auto text-center space-y-2 p-6">
          <p className="text-xs text-slate-500">Vista previa no disponible para este formato.</p>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-carbon-dark hover:bg-slate-50">
              <ExternalLink className="w-3.5 h-3.5" /> Abrir en pestaña nueva
            </a>
          )}
        </div>
      )}
    </div>
  );
};
