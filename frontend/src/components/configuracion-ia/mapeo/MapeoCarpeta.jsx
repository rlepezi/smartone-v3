import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Truck, Users, ChevronDown, ChevronRight, Eye, File, FileImage, FileSpreadsheet, FileText, Folder, Loader2,
  Copy, MousePointerClick, Plus, Search, Sparkles, X,
} from "lucide-react";
import { listarDirectorio, obtenerArchivo } from "../../../services/fuentes/carpetaLocal";
import { carpetaEmpresaService } from "../../../services/carpetaEmpresaService";
import { avanceMapeo } from "../../../utils/carpetaExpediente";
import { ancestros, cambiosAsignacion, cambiosQuitar, entradasPlanas, estadoNodo } from "../../../utils/mapeoArbol";
import { mejorPorRequerimiento, sugerenciasDelArbol, sugerirEspecial } from "../../../utils/sugerenciasMapeo";
import { nombresNivel1, similitudCarpetas, UMBRAL_OFRECER } from "../../../utils/copiaMapeo";
import { patronService } from "../../../services/patronService";
import { CopiarMapeoModal } from "./CopiarMapeoModal";
import { extensionDe, formatTamano } from "../../../utils/repositorioDocumental";
import { formatFecha } from "../../../utils/fechas";
import { VisorArchivo } from "../../expedientes/documentacion/VisorArchivo";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO } from "../estilos";

const CLASE_BUSCAR = "w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
const ETIQUETA = "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap";
const ENLACE = "text-[11px] font-bold text-primary hover:underline disabled:opacity-50";
// Sugerencias por nombre: color y etiqueta por confianza.
const CONFIANZA = {
  alta: { label: "Alta", clase: "bg-sage-lighter text-sage-darker border-sage-light" },
  media: { label: "Media", clase: "bg-amber-50 text-amber-700 border-amber-200" },
  baja: { label: "Baja", clase: "bg-slate-100 text-slate-600 border-slate-200" },
};

// Carpetas especiales (paso 1): nombre de la carpeta que suele contenerlas, para sugerirla.
const ESPECIALES = [
  { campo: "carpetaPersonas", titulo: "Carpeta del personal", ayuda: "La que tiene una subcarpeta por trabajador.", patron: /trabajador|personal|persona/i,
    Icono: Users, colorIcono: "bg-sky-50 text-sky-700 border-sky-200" },
  { campo: "carpetaRecursos", titulo: "Carpeta de maquinarias", ayuda: "La que tiene una subcarpeta por vehículo o equipo.", patron: /veh[ií]cul|maquinari|equipo/i,
    Icono: Truck, colorIcono: "bg-amber-50 text-amber-700 border-amber-200" },
];

const IconoArchivo = ({ nombre }) => {
  const ext = extensionDe(nombre);
  const Icono = ["pdf", "doc", "docx", "txt"].includes(ext) ? FileText
    : ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? FileImage
      : ["xls", "xlsx", "xlsm", "csv"].includes(ext) ? FileSpreadsheet : File;
  return <Icono className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
};

// ¿Existe `ruta` (carpeta o archivo) dentro de `raiz`? Recorre solo esa ruta (no lee el árbol).
const existeRuta = async (raiz, ruta, tipo) => {
  const partes = String(ruta || "").split("/").filter(Boolean);
  if (!partes.length) return false;
  let actual = raiz;
  try {
    for (let i = 0; i < partes.length - 1; i++) actual = await actual.getDirectoryHandle(partes[i]);
    const ultimo = partes[partes.length - 1];
    if (tipo === "archivo") await actual.getFileHandle(ultimo);
    else await actual.getDirectoryHandle(ultimo);
    return true;
  } catch {
    return false;
  }
};

const nombreReq = (r) => r?.nombreCorto || r?.nombre || "Requerimiento";
const ultimo = (ruta) => String(ruta || "").split("/").pop();

// Mapeo de una Carpeta de empresa registrada, guiado por requerimiento:
//  - Encabezado: avance y la carpeta del personal y de maquinarias (con sugerencia).
//  - Requerimientos: cada uno con su ubicación; "Elegir en el árbol" deja el árbol en modo selección
//    y el siguiente clic en una carpeta o archivo lo asigna.
// El árbol (a la derecha) se lee un nivel a la vez y no tiene controles: muestra etiquetas de lo
// asignado, de lo incluido en una carpeta asignada y de las personas o maquinarias. Fuera del modo
// selección, un clic en un archivo lo previsualiza. Cada cambio se guarda en el backend, que valida
// las reglas y recalcula el estado del mapeo. Las rutas guardadas que ya no existen se marcan
// "No encontrada" (Cambiar / Quitar): nunca se borran solas.
//  - carpeta: Carpeta de empresa (pública, con avance). base: useCarpetaBase (raíz autorizada).
//  - onActualizada(carpeta): tras cada guardado (con el avance recalculado).
export const MapeoCarpeta = ({ carpeta, carpetas = [], base, onActualizada }) => {
  const [raiz, setRaiz] = useState({ handle: null, error: null, listo: false });
  const [niveles, setNiveles] = useState(() => new Map()); // ruta → { estado, carpetas, archivos }
  const [abiertas, setAbiertas] = useState(() => new Set());
  const [asignables, setAsignables] = useState(null);
  const [faltantes, setFaltantes] = useState(() => new Set());
  // Modo selección: { tipo: "requerimiento", requerimientoId, reemplazar } | { tipo: "especial", campo }.
  const [modo, setModo] = useState(null);
  const [resaltadas, setResaltadas] = useState(() => new Set());
  const [soloSinAsignar, setSoloSinAsignar] = useState(false);
  const [soloSinUbicar, setSoloSinUbicar] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [visor, setVisor] = useState(null); // File
  const [patrones, setPatrones] = useState([]); // aprendidos del Mandante (activos)
  const [versionPatrones, setVersionPatrones] = useState(0);
  const [conSugerencia, setConSugerencia] = useState(false);
  const [similares, setSimilares] = useState(null); // [{ carpeta, similitud }] (top 5)
  const [copiar, setCopiar] = useState(null); // { inicial } | null
  const [bannerCerrado, setBannerCerrado] = useState(false);
  const { subcarpeta } = base;

  const estadoMapeo = { mapeo: carpeta.mapeo || {}, carpetaPersonas: carpeta.carpetaPersonas, carpetaRecursos: carpeta.carpetaRecursos };
  const requerimientos = asignables?.requerimientos || [];
  const porId = new Map(requerimientos.map((r) => [r.id, r]));
  // Sugerencias por nombre del requerimiento sobre lo ya cargado del árbol (no se guardan solas).
  const nodosCargados = [...niveles.values()].flatMap((n) => [
    ...(n.carpetas || []).map((c) => ({ ...c, tipo: "carpeta" })),
    ...(n.archivos || []).map((a) => ({ ...a, tipo: "archivo" })),
  ]);
  // Por nodo (motor compartido: patrones aprendidos y nombres) y la mejor por requerimiento.
  const sugerenciasArbol = sugerenciasDelArbol({ nodos: nodosCargados, estado: estadoMapeo, patrones, requerimientos });
  const sugerencias = mejorPorRequerimiento(sugerenciasArbol);
  const conteo = { alta: 0, media: 0, baja: 0 };
  sugerenciasArbol.forEach((sg) => { conteo[sg.nivel]++; });
  const altas = [...sugerenciasArbol.values()].filter((sg) => sg.nivel === "alta" && !sg.ambiguo);
  const conSugerenciaDentro = (ruta) => [...sugerenciasArbol.keys()].some((r) => r.startsWith(`${ruta}/`));

  // Raíz de la carpeta, su primer nivel y la lista de requerimientos asignables.
  useEffect(() => {
    let vigente = true;
    (async () => {
      const handle = await subcarpeta(carpeta.ruta).catch(() => null);
      const lista = await carpetaEmpresaService.requerimientos(carpeta.id).catch((err) => ({ error: err.message }));
      const primero = handle ? await listarDirectorio(handle, "").catch(() => null) : null;
      return { handle, lista, primero };
    })().then(({ handle, lista, primero }) => {
      if (!vigente) return;
      setRaiz({ handle, error: handle ? null : `No se encontró la carpeta «${carpeta.ruta}» en la fuente.`, listo: true });
      if (lista?.error) setError(lista.error);
      else setAsignables(lista);
      if (primero) setNiveles(new Map([["", { estado: "ok", ...primero }]]));
    });
    return () => { vigente = false; };
  }, [carpeta.id, carpeta.ruta, subcarpeta]);

  // Patrones aprendidos del Mandante (se recargan tras cada guardado: el backend aprende).
  useEffect(() => {
    let vigente = true;
    patronService.listar({ mandanteId: carpeta.mandanteId, estado: "activo" })
      .then((l) => { if (vigente) setPatrones(l || []); })
      .catch(() => { if (vigente) setPatrones([]); });
    return () => { vigente = false; };
  }, [carpeta.mandanteId, versionPatrones]);

  // Carpetas parecidas ya mapeadas (parcial o completo), por su primer nivel: solo se lee el primer
  // nivel de cada candidata.
  const primero = niveles.get("");
  const listoPrimero = primero?.estado === "ok";
  useEffect(() => {
    if (!listoPrimero) return undefined;
    let vigente = true;
    const propio = nombresNivel1(primero);
    const candidatas = carpetas.filter((c) => c.id !== carpeta.id && ["parcial", "completo"].includes(c.estadoMapeo));
    Promise.all(candidatas.map(async (c) => {
      const h = await subcarpeta(c.ruta).catch(() => null);
      const l = h ? await listarDirectorio(h, "").catch(() => null) : null;
      return { carpeta: c, similitud: l ? similitudCarpetas(propio, nombresNivel1(l)) : 0 };
    })).then((lista) => {
      if (vigente) setSimilares(lista.filter((x) => x.similitud > 0).sort((a, b) => b.similitud - a.similitud).slice(0, 5));
    });
    return () => { vigente = false; };
    // Al abrir la carpeta (o cambiar la lista de carpetas).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listoPrimero, carpeta.id, carpetas.length]);

  // Rutas guardadas que ya no existen (solo esas rutas; no se lee el árbol completo).
  const firmaRutas = JSON.stringify([entradasPlanas(carpeta.mapeo), carpeta.carpetaPersonas, carpeta.carpetaRecursos]);
  useEffect(() => {
    if (!raiz.handle) return undefined;
    let vigente = true;
    const rutas = [
      ...entradasPlanas(carpeta.mapeo).map((e) => ({ ruta: e.ruta, tipo: e.tipo })),
      ...[carpeta.carpetaPersonas, carpeta.carpetaRecursos].filter(Boolean).map((ruta) => ({ ruta, tipo: "carpeta" })),
    ];
    Promise.all(rutas.map(async (r) => ((await existeRuta(raiz.handle, r.ruta, r.tipo)) ? null : r.ruta)))
      .then((res) => { if (vigente) setFaltantes(new Set(res.filter(Boolean))); });
    return () => { vigente = false; };
    // firmaRutas resume las rutas guardadas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raiz.handle, firmaRutas]);

  const cargarNivel = useCallback(async (ruta) => {
    if (!raiz.handle) return;
    setNiveles((m) => (m.has(ruta) ? m : new Map(m).set(ruta, { estado: "cargando", carpetas: [], archivos: [] })));
    const contenido = await listarDirectorio(raiz.handle, ruta).catch(() => null);
    setNiveles((m) => new Map(m).set(ruta, contenido ? { estado: "ok", ...contenido } : { estado: "error", carpetas: [], archivos: [] }));
  }, [raiz.handle]);

  const alternar = (ruta) => {
    setAbiertas((s) => {
      const n = new Set(s);
      if (n.has(ruta)) n.delete(ruta); else n.add(ruta);
      return n;
    });
    if (!niveles.has(ruta)) cargarNivel(ruta);
  };

  // Expande (cargando) hasta cada ruta y la resalta.
  const mostrar = async (rutas) => {
    const carpetas = [...new Set(rutas.flatMap((r) => ancestros(r)))];
    for (const c of carpetas) if (!niveles.has(c)) await cargarNivel(c);
    setAbiertas((s) => new Set([...s, ...carpetas]));
    setResaltadas(new Set(rutas));
  };

  const guardar = async (cambios) => {
    setGuardando(true);
    setError(null);
    try {
      const actualizada = await carpetaEmpresaService.actualizar(carpeta.id, cambios);
      onActualizada({ ...actualizada, avance: avanceMapeo(actualizada.mapeo, requerimientos.map((r) => r.id)) });
      setVersionPatrones((v) => v + 1);
      return true;
    } catch (err) {
      setError(err.message || "No se pudo guardar.");
      return false;
    } finally {
      setGuardando(false);
    }
  };

  // Acepta sugerencias [{ nodo, requerimientoId }] en UNA sola llamada, con origen "sugerencia" (el
  // backend valida las reglas y aprende los patrones).
  const aceptar = async (lista) => {
    let mapeo = carpeta.mapeo || {};
    let cambios = {};
    lista.forEach(({ nodo, requerimientoId }) => {
      if (!requerimientoId) return;
      const c = cambiosAsignacion(mapeo, nodo, requerimientoId, "sugerencia");
      cambios = { ...cambios, ...c };
      mapeo = { ...mapeo, ...c };
    });
    if (Object.keys(cambios).length && await guardar({ mapeo: cambios })) {
      setResaltadas(new Set(lista.map((x) => x.nodo.ruta)));
    }
  };

  // Clic en un nodo durante el modo selección.
  const elegirNodo = async (nodo) => {
    if (!modo) return;
    if (modo.tipo === "especial") {
      if (nodo.tipo !== "carpeta") return;
      if (await guardar({ [modo.campo]: nodo.ruta })) setModo(null);
      return;
    }
    let mapeo = carpeta.mapeo || {};
    let cambios = {};
    if (modo.reemplazar) {
      cambios = cambiosQuitar(mapeo, modo.requerimientoId, modo.reemplazar);
      mapeo = { ...mapeo, ...cambios };
    }
    cambios = { ...cambios, ...cambiosAsignacion(mapeo, nodo, modo.requerimientoId) };
    if (!Object.keys(cambios).length || await guardar({ mapeo: cambios })) {
      setModo(null);
      setResaltadas(new Set([nodo.ruta]));
    }
  };

  const termino = busqueda.trim().toLowerCase();
  const coincide = (ruta, nombre, tipo) => {
    if (!termino || nombre.toLowerCase().includes(termino)) return true;
    if (tipo !== "carpeta") return false;
    const n = niveles.get(ruta);
    return Boolean(n) && [...n.carpetas.map((c) => [c.ruta, c.nombre, "carpeta"]), ...n.archivos.map((a) => [a.ruta, a.nombre, "archivo"])]
      .some(([r, nm, t]) => coincide(r, nm, t));
  };

  // Funciones de render (no componentes): no se vuelven a montar en cada render.
  const renderNodo = (nodo, nivel) => {
    const estado = estadoNodo(nodo, estadoMapeo);
    if (soloSinAsignar && ["asignado", "incluido"].includes(estado.clase)) return null;
    if (conSugerencia && !sugerenciasArbol.has(nodo.ruta) && !(nodo.tipo === "carpeta" && conSugerenciaDentro(nodo.ruta))) return null;
    if (!coincide(nodo.ruta, nodo.nombre, nodo.tipo)) return null;
    const abierta = abiertas.has(nodo.ruta);
    const contenido = niveles.get(nodo.ruta);
    const elegible = modo && (modo.tipo === "especial"
      ? nodo.tipo === "carpeta" && ["libre"].includes(estado.clase)
      : ["libre", "asignado"].includes(estado.clase));
    const clic = () => {
      if (modo) { if (elegible) elegirNodo(nodo); return; }
      if (nodo.tipo === "carpeta") alternar(nodo.ruta);
      else obtenerArchivo(raiz.handle, nodo.ruta).then(setVisor).catch(() => setVisor(null));
    };
    return (
      <li key={nodo.ruta}>
        <div role="button" tabIndex={0} onClick={clic} onKeyDown={(e) => { if (e.key === "Enter") clic(); }}
          className={`flex items-center gap-1.5 py-1 pr-2 rounded-lg cursor-pointer ${
            resaltadas.has(nodo.ruta) ? "bg-amber-50 ring-1 ring-amber-200"
              : elegible ? "hover:bg-primary-lighter ring-1 ring-transparent hover:ring-primary/30"
                : modo ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"}`}
          style={{ paddingLeft: `${nivel * 16 + 4}px` }}>
          {nodo.tipo === "carpeta" ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); alternar(nodo.ruta); }} aria-label={abierta ? `Contraer ${nodo.nombre}` : `Expandir ${nodo.nombre}`} className="p-0.5 text-slate-400 hover:text-primary">
              {abierta ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : <span className="w-[18px]" />}
          {nodo.tipo === "carpeta" ? <Folder className="w-3.5 h-3.5 text-primary shrink-0" /> : <IconoArchivo nombre={nodo.nombre} />}
          <span className={`min-w-0 truncate text-xs ${nodo.tipo === "carpeta" ? "font-semibold text-carbon-dark" : "text-slate-700"}`}>{nodo.nombre}</span>
          {nodo.tipo === "archivo" && (
            <span className="shrink-0 text-[10px] text-slate-400 tabular-nums">{formatTamano(nodo.tamanoBytes)} · {formatFecha(nodo.ultimaModificacion)}</span>
          )}
          <span className="ml-auto shrink-0 pl-2">
            {estado.clase === "base" && <span className={`${ETIQUETA} bg-sky-50 text-sky-700 border-sky-200`}>{estado.etiqueta}</span>}
            {estado.clase === "sujeto" && <span className={`${ETIQUETA} bg-slate-100 text-slate-600 border-slate-200`}>{estado.etiqueta}</span>}
            {estado.clase === "asignado" && <span className={`${ETIQUETA} bg-sage-lighter text-sage-darker border-sage-light`}>{nombreReq(porId.get(estado.requerimientoId))}</span>}
            {estado.clase === "incluido" && <span className="text-[10px] text-slate-400">Incluido en {nombreReq(porId.get(estado.requerimientoId))}</span>}
            {estado.clase === "libre" && sugerenciasArbol.has(nodo.ruta) && !modo && (() => {
              const sg = sugerenciasArbol.get(nodo.ruta);
              return (
                <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {sg.ambiguo ? (
                    <select value="" disabled={guardando} aria-label={`Requerimiento sugerido para ${nodo.nombre}`}
                      onChange={(e) => aceptar([{ nodo, requerimientoId: e.target.value }])}
                      className={`${ETIQUETA} border-dashed ${CONFIANZA[sg.nivel].clase} cursor-pointer`}>
                      <option value="">Ambigua: elija…</option>
                      {sg.candidatos.map((id) => <option key={id} value={id}>{nombreReq(porId.get(id))}</option>)}
                    </select>
                  ) : (
                    <>
                      <span className={`${ETIQUETA} border-dashed ${CONFIANZA[sg.nivel].clase}`} title={`Confianza ${CONFIANZA[sg.nivel].label.toLowerCase()}`}>
                        <Sparkles className="w-2.5 h-2.5 mr-0.5" /> {nombreReq(porId.get(sg.requerimientoId))}
                      </span>
                      <button type="button" disabled={guardando} onClick={() => aceptar([sg])} className="text-[10px] font-bold text-primary hover:underline">Aceptar</button>
                    </>
                  )}
                </span>
              );
            })()}
          </span>
        </div>
        {nodo.tipo === "carpeta" && abierta && (
          contenido?.estado === "cargando" ? (
            <p className="flex items-center gap-1.5 py-1 text-[11px] text-slate-400" style={{ paddingLeft: `${(nivel + 1) * 16 + 24}px` }}><Loader2 className="w-3 h-3 animate-spin" /> Cargando...</p>
          ) : contenido?.estado === "error" ? (
            <p className="py-1 text-[11px] text-red-600" style={{ paddingLeft: `${(nivel + 1) * 16 + 24}px` }}>No se pudo leer esta carpeta.</p>
          ) : (
            renderHijos(nodo.ruta, nivel + 1)
          )
        )}
      </li>
    );
  };

  const renderHijos = (ruta, nivel) => {
    const n = niveles.get(ruta);
    if (!n || n.estado !== "ok") return null;
    if (!n.carpetas.length && !n.archivos.length) {
      return <p className="py-1 text-[11px] text-slate-400" style={{ paddingLeft: `${nivel * 16 + 24}px` }}>Carpeta vacía.</p>;
    }
    return (
      <ul>
        {n.carpetas.map((c) => renderNodo({ ...c, tipo: "carpeta" }, nivel))}
        {n.archivos.map((a) => renderNodo({ ...a, tipo: "archivo" }, nivel))}
      </ul>
    );
  };

  if (!raiz.listo) return <div className="h-40 rounded-2xl bg-slate-50 animate-pulse" aria-hidden="true" />;
  if (!raiz.handle) return <p role="alert" className="p-4 rounded-2xl border border-amber-200 bg-amber-50 text-xs text-amber-800">{raiz.error}</p>;

  const primerNivel = niveles.get("")?.carpetas || [];
  const ubicadas = (id) => carpeta.mapeo?.[id] || [];
  const avance = carpeta.avance || avanceMapeo(carpeta.mapeo, requerimientos.map((r) => r.id));
  const pct = avance.total ? Math.round((avance.ubicados / avance.total) * 100) : 0;
  // En el orden (y con el número) del expediente.
  const visiblesReq = requerimientos.filter((r) => !soloSinUbicar || !ubicadas(r.id).length);
  const ubicadosReq = requerimientos.filter((r) => ubicadas(r.id).length).length;
  const activoEn = (id) => modo?.tipo === "requerimiento" && modo.requerimientoId === id;

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-2xl border border-slate-100 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Folder className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-carbon-dark mr-auto">{carpeta.ruta}</h3>
          <span className="text-xs text-slate-500">{carpeta.empresaNombre || ""}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
          <div className={`h-full ${avance.total && avance.ubicados === avance.total ? "bg-sage" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-slate-500">
          <b className="text-carbon-dark">{avance.ubicados} de {avance.total}</b> requerimientos ubicados.
          {asignables && !asignables.conExpediente && " Sin expediente: se muestran todos los requerimientos de Empresa del Mandante."}
        </p>
        {/* Carpeta del personal y de maquinarias: datos de la carpeta (no un paso aparte). */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
            {ESPECIALES.map(({ campo, titulo, ayuda, Icono, colorIcono }) => {
              const valor = carpeta[campo] || null;
              const especial = !valor ? sugerirEspecial({ campo, carpetas: primerNivel, estado: estadoMapeo, patrones }) : null;
              const sugerida = especial?.nodo || null;
              const eligiendo = modo?.tipo === "especial" && modo.campo === campo;
              return (
                <div key={campo} className={`p-2 rounded-xl border text-xs space-y-1 ${eligiendo ? "border-primary bg-primary-lighter/40" : "border-slate-100"}`}>
                  <p className="flex items-center gap-2 font-bold text-carbon-dark">
                    <span className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 ${colorIcono}`}><Icono className="w-3.5 h-3.5" /></span>
                    {titulo}
                  </p>
                  {valor ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => mostrar([valor])} className="min-w-0 text-left text-slate-700 hover:text-primary hover:underline break-all">{valor}</button>
                      {faltantes.has(valor) && <span className="inline-flex items-center gap-1 text-[10px] text-amber-700"><AlertTriangle className="w-3 h-3" /> No encontrada</span>}
                      <span className="ml-auto flex gap-2">
                        <button type="button" onClick={() => setModo({ tipo: "especial", campo })} className={ENLACE}>Cambiar</button>
                        <button type="button" disabled={guardando} onClick={() => guardar({ [campo]: null })} className={`${ENLACE} text-slate-500`}>Quitar</button>
                      </span>
                    </div>
                  ) : (
                    <>
                      <p className="text-[11px] text-slate-500">{ayuda}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {sugerida && (
                          <button type="button" disabled={guardando} onClick={() => guardar({ [campo]: sugerida.ruta })} className={`${CLASE_PRIMARIO} px-2.5 py-1 text-[11px]`}>
                            Usar «{sugerida.nombre}»{especial.porPatron ? " (aprendida)" : ""}
                          </button>
                        )}
                        <button type="button" onClick={() => setModo({ tipo: "especial", campo })} className={ENLACE}>Elegir en el árbol</button>
                        <span className="text-[10px] text-slate-400">o déjala vacía si no aplica.</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {!bannerCerrado && similares?.[0] && similares[0].similitud >= UMBRAL_OFRECER &&
        (carpeta.estadoMapeo === "sin_mapear" || (avance.total && avance.ubicados / avance.total < 0.2)) && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-primary-lighter/60 border border-primary/20 text-xs text-primary-dark">
          <Copy className="w-4 h-4" />
          <span className="mr-auto">
            Se parece en un {Math.round(similares[0].similitud * 100)}% a «{similares[0].carpeta.ruta}» (mapeo {similares[0].carpeta.estadoMapeo}).
          </span>
          <button type="button" onClick={() => setCopiar({ inicial: similares[0].carpeta.id })} className={`${CLASE_PRIMARIO} px-2.5 py-1 text-[11px]`}>Ver propuesta</button>
          <button type="button" onClick={() => setBannerCerrado(true)} aria-label="Cerrar aviso" className="p-1 rounded-lg hover:bg-white/50"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-3 items-start">
        <div className="space-y-3">

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200 space-y-1.5">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-carbon-dark">Requerimientos</h4>
                {asignables && <span className="px-2 py-px rounded-full bg-white border border-slate-200 text-[10px] font-bold text-slate-600 tabular-nums">{ubicadosReq} / {requerimientos.length} ubicados</span>}
                <label className="ml-auto flex items-center gap-1 text-[10px] text-slate-600">
                  <input type="checkbox" checked={soloSinUbicar} onChange={(e) => setSoloSinUbicar(e.target.checked)} className="rounded text-primary" /> Solo sin ubicar
                </label>
              </div>
              <p className="text-[11px] text-slate-500">Use la sugerencia o «Elegir en el árbol» y haga clic en la carpeta o el archivo que lo cumple.</p>
            </div>
            {!asignables ? <p className="p-3 text-[11px] text-slate-400">Cargando requerimientos...</p> : visiblesReq.length === 0 ? (
              <p className="p-3 text-[11px] text-slate-400">{requerimientos.length ? "Todos los requerimientos están ubicados." : "No hay requerimientos de Empresa."}</p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[36rem] overflow-y-auto">
                {visiblesReq.map((r) => {
                  const lista = ubicadas(r.id);
                  const sg = !lista.length ? sugerencias.get(r.id) : null;
                  const activo = activoEn(r.id);
                  return (
                    <li key={r.id} className={`px-3 py-2 text-xs transition-colors ${activo ? "bg-primary-lighter/60" : "hover:bg-slate-50"}`}>
                      <div className="flex items-start gap-2">
                        <span className={`mt-px w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold tabular-nums ${lista.length ? "bg-sage-lighter text-sage-darker" : "bg-slate-100 text-slate-500"}`}>
                          {r.numero}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-start gap-2">
                            <p className="min-w-0 flex-1 font-semibold text-carbon-dark leading-snug">{nombreReq(r)}</p>
                            {lista.length
                              ? <span className={`${ETIQUETA} bg-sage-lighter text-sage-darker border-sage-light`}>Ubicado</span>
                              : <span className={`${ETIQUETA} bg-white text-slate-500 border-slate-200`}>Sin ubicar</span>}
                          </div>
                          {lista.map((e) => (
                            <div key={e.ruta} className="flex items-center gap-1.5 text-[11px]">
                              {e.tipo === "archivo" ? <FileText className="w-3 h-3 shrink-0 text-slate-400" /> : <Folder className="w-3 h-3 shrink-0 text-primary" />}
                              <button type="button" onClick={() => mostrar([e.ruta])} title={e.ruta} className="min-w-0 truncate text-left text-slate-700 hover:text-primary hover:underline">{ultimo(e.ruta)}</button>
                              {faltantes.has(e.ruta) && <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-amber-700"><AlertTriangle className="w-3 h-3" /> No encontrada</span>}
                              <span className="ml-auto shrink-0 flex gap-2">
                                <button type="button" onClick={() => setModo({ tipo: "requerimiento", requerimientoId: r.id, reemplazar: e.ruta })} className={ENLACE}>Cambiar</button>
                                <button type="button" disabled={guardando} onClick={() => guardar({ mapeo: cambiosQuitar(carpeta.mapeo, r.id, e.ruta) })} className={`${ENLACE} text-slate-500`}>Quitar</button>
                              </span>
                            </div>
                          ))}
                          {sg && (
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className={`${ETIQUETA} ${CONFIANZA[sg.nivel].clase}`}>Sugerida · {CONFIANZA[sg.nivel].label}</span>
                              <button type="button" onClick={() => mostrar([sg.nodo.ruta])} title={sg.nodo.ruta} className="min-w-0 truncate text-left text-slate-700 hover:text-primary hover:underline">{sg.nodo.nombre}</button>
                              <button type="button" disabled={guardando} onClick={() => aceptar([sg])} className={`${CLASE_PRIMARIO} ml-auto shrink-0 px-2.5 py-0.5 text-[11px]`}>Usar</button>
                            </div>
                          )}
                          <button type="button" onClick={() => setModo(activo ? null : { tipo: "requerimiento", requerimientoId: r.id, reemplazar: null })}
                            className={`${ENLACE} inline-flex items-center gap-1`}>
                            {activo ? "Cancelar" : lista.length ? <><Plus className="w-3 h-3" /> Agregar otra ubicación</> : <><MousePointerClick className="w-3 h-3" /> Elegir en el árbol</>}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <section className="rounded-2xl border border-slate-100 p-3 space-y-2 min-w-0 xl:sticky xl:top-4">
          {modo ? (
            <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-primary text-white text-[11px]">
              <MousePointerClick className="w-3.5 h-3.5" />
              <span className="mr-auto">
                {modo.tipo === "especial"
                  ? `Haga clic en la carpeta que será la ${ESPECIALES.find((x) => x.campo === modo.campo).titulo.toLowerCase()}.`
                  : `Haga clic en la carpeta o el archivo de «${nombreReq(porId.get(modo.requerimientoId))}».`}
              </span>
              <button type="button" onClick={() => setModo(null)} className="px-2 py-0.5 rounded-lg bg-white/20 hover:bg-white/30 font-bold">Cancelar</button>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><Eye className="w-3.5 h-3.5" /> Árbol de la carpeta: clic en una carpeta para abrirla, en un archivo para verlo.</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-40">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en lo abierto..." aria-label="Buscar en el árbol" className={CLASE_BUSCAR} />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <input type="checkbox" checked={soloSinAsignar} onChange={(e) => setSoloSinAsignar(e.target.checked)} className="rounded text-primary" /> Solo sin asignar
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <input type="checkbox" checked={conSugerencia} onChange={(e) => setConSugerencia(e.target.checked)} className="rounded text-primary" /> Con sugerencia
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-slate-500 mr-auto">
              Sugerencias: <b className="text-sage-darker">{conteo.alta} altas</b> · <b className="text-amber-700">{conteo.media} medias</b> · <b className="text-slate-600">{conteo.baja} bajas</b>
            </span>
            {altas.length > 0 && (
              <button type="button" disabled={guardando || Boolean(modo)} onClick={() => aceptar(altas)} className={`${CLASE_PRIMARIO} px-2.5 py-1 text-[11px]`}>
                Confirmar todas las altas ({altas.length})
              </button>
            )}
            {similares?.length > 0 && (
              <button type="button" disabled={Boolean(modo)} onClick={() => setCopiar({ inicial: similares[0].carpeta.id })} className={`${CLASE_SECUNDARIO} px-2.5 py-1 text-[11px]`}>
                <Copy className="w-3 h-3" /> Copiar mapeo de…
              </button>
            )}
          </div>
          <div className="max-h-[38rem] overflow-y-auto">
            {renderHijos("", 0)}
          </div>
        </section>
      </div>

      {copiar && similares?.length > 0 && (
        <CopiarMapeoModal similares={similares} inicial={copiar.inicial} destino={carpeta} raiz={raiz.handle}
          asignables={requerimientos.map((r) => r.id)} nombreDe={(id) => nombreReq(porId.get(id))}
          onConfirmar={(cambios) => guardar(cambios)} onCerrar={() => setCopiar(null)} />
      )}

      {visor && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-white shadow-dropdown border-l border-slate-200 flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <p className="mr-auto min-w-0 truncate text-sm font-bold text-carbon-dark">{visor.name}</p>
            <button type="button" onClick={() => setVisor(null)} aria-label="Cerrar visor" className="p-1.5 rounded-lg text-slate-400 hover:text-carbon-dark hover:bg-slate-50"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-auto">
            <VisorArchivo archivo={visor} mostrarNombre={false} />
          </div>
        </div>
      )}
    </div>
  );
};
