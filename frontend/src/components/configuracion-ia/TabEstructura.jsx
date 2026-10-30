import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, FolderSearch, FolderTree, Pencil, Plus, ShieldAlert, Sparkles, Trash2, Upload } from "lucide-react";
import { useMandanteContexto } from "../../hooks/useMandanteContexto";
import { CampoMandante } from "../shared/CampoMandante";
import { ErrorBanner } from "../shared/ErrorBanner";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { AlcancePanel } from "../revisiones-ia/AlcancePanel";
import { plantillaEstructuraService } from "../../services/plantillaEstructuraService";
import { revisionIAService } from "../../services/revisionIAService";
import { requerimientoService } from "../../services/requerimientoService";
import { soportaSelectorCarpeta, elegirConSelector, leerArbolDesdeInput } from "../../services/fuentes/carpetaLocal";
import { CLASE_BADGE, ESTADO_COMPLETITUD } from "../../utils/revisionIA";
import { Tarjeta } from "./Tarjeta";
import { SeccionModal, DocumentoModal } from "./EditorPlantillaModales";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO, TIPOS_SECCION } from "./estilos";

const ETIQUETA_TIPO = Object.fromEntries(TIPOS_SECCION.map((t) => [t.value, t.label.split(" (")[0]]));
const NIVEL_LISTA = { archivosSeccion: "archivoSeccion", documentos: "documento" };
const claveCambio = (nivel, seccionClave, elementoClave = "") => `${nivel}|${seccionClave}|${elementoClave}`;
const estructuraDe = (p) => (p ? { nombre: p.nombre, profundidadSubcontratos: p.profundidadSubcontratos, secciones: p.secciones } : null);
const MSG_HAY_ESTRUCTURA = "Guarde o descarte los cambios de estructura antes de cambiar la habilitación.";
const MSG_HAY_PENDIENTES = "Guarde o descarte los cambios de habilitación antes de editar la estructura.";

const Chips = ({ valores, clase = "bg-slate-100 text-slate-600" }) => (
  <span className="flex flex-wrap gap-1">
    {(valores || []).map((v) => <span key={v} className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${clase}`}>{v}</span>)}
  </span>
);

// Interruptor accesible (role="switch").
const Switch = ({ activo, onChange, deshabilitado, titulo, etiqueta }) => (
  <button
    type="button" role="switch" aria-checked={activo} aria-label={etiqueta} title={titulo} disabled={deshabilitado}
    onClick={() => onChange(!activo)}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed ${activo ? "bg-primary" : "bg-slate-300"}`}
  >
    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${activo ? "translate-x-4" : "translate-x-0.5"}`} />
  </button>
);

const descargarJson = (nombre, datos) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Resultado de "Probar con una carpeta": cómo calzó cada carpeta y cada archivo.
const ResultadoPrueba = ({ plan, secciones }) => {
  const nombre = new Map(secciones.map((s) => [s.clave, s.nombre]));
  if (!plan.tipoEstructura) {
    return <p className="text-xs text-amber-700">{plan.advertencias[0]} {(plan.detalle || []).map((d) => `${d.carpeta}: ${d.seccionesReconocidas} secciones`).join(" · ")}</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600">{plan.tipoEstructura === "repositorio" ? `Repositorio con ${plan.empresas.length} empresas` : "Carpeta de una empresa"}.</p>
      {plan.empresas.map((e) => (
        <div key={e.empresaCarpeta} className="rounded-xl border border-slate-100 p-3 space-y-2">
          <p className="text-xs font-bold text-carbon-dark">{e.nombreEmpresaDetectado}{e.textoProyecto ? ` · ${e.textoProyecto}` : ""}</p>
          <table className="w-full text-left text-[11px]">
            <tbody className="divide-y divide-slate-50">
              {e.secciones.filter((s) => !s.entidadCarpeta).map((s, i) => (
                <tr key={`${s.seccionClave}-${i}`} className={["no_reconocida", "deshabilitada"].includes(s.estado) ? "text-slate-400" : ""}>
                  <td className="py-1 pr-2">{s.seccionCarpeta || "—"}</td>
                  <td className="py-1 px-2">{s.seccionClave ? nombre.get(s.seccionClave) : "No reconocida"}{s.calce?.similitud ? ` (${Math.round(s.calce.similitud * 100)}%)` : ""}</td>
                  <td className="py-1 pl-2"><span className={`${CLASE_BADGE} ${(ESTADO_COMPLETITUD[s.estado] || ESTADO_COMPLETITUD.no_aplica).clase}`}>{(ESTADO_COMPLETITUD[s.estado] || {}).label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {e.secciones.filter((s) => s.entidadCarpeta).map((s) => (
            <details key={s.entidadCarpeta} className="text-[11px]">
              <summary className="cursor-pointer font-semibold text-slate-600">
                {nombre.get(s.seccionClave)} / {s.entidadNombre} — {s.documentosEncontrados.length} documentos, faltan {s.documentosFaltantes.length}
                {(s.documentosIgnorados || []).length > 0 && `, ${s.documentosIgnorados.length} ignorados`}
              </summary>
              <ul className="pl-4 py-1 space-y-0.5">
                {(s.calceArchivos || []).map((c) => {
                  const ignorado = (s.documentosIgnorados || []).some((d) => d.clave === c.documentoClave);
                  return (
                    <li key={c.nombre} className={!c.documentoClave ? "text-amber-700" : ignorado ? "text-slate-400" : "text-slate-600"}>
                      {c.nombre} → {c.documentoClave || "no reconocido"}{c.documentoClave ? ` (${Math.round(c.similitud * 100)}%)` : ""}{ignorado ? " · Ignorado" : ""}
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </div>
      ))}
    </div>
  );
};

// Pestaña "Estructura de carpetas" (superadmin; mandante_admin su Mandante): plantilla que describe
// qué secciones y documentos se esperan en la carpeta de arranque de cada empresa y cómo
// reconocerlos (alias), qué se toma en cuenta en la revisión (habilitación) y el alcance de
// validación resultante. Los cambios de habilitación se acumulan y se guardan juntos (una versión).
export const TabEstructura = () => {
  const contexto = useMandanteContexto();
  const { mandanteId, modo } = contexto;
  const [plantilla, setPlantilla] = useState(undefined);
  const [borrador, setBorrador] = useState(null);
  const [alcance, setAlcance] = useState(null);
  const [pendientes, setPendientes] = useState(() => new Map());
  const [tipos, setTipos] = useState([]);
  const [requerimientos, setRequerimientos] = useState([]);
  const [abiertas, setAbiertas] = useState(() => new Set());
  const [modal, setModal] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [prueba, setPrueba] = useState(null);
  const inputJson = useRef(null);
  const inputCarpeta = useRef(null);

  useEffect(() => {
    if (!mandanteId) return undefined;
    let vigente = true;
    Promise.all([
      plantillaEstructuraService.obtenerActiva(mandanteId),
      revisionIAService.listarTiposDocumentales().catch(() => []),
      requerimientoService.listar({ mandanteId, estado: "activo" }).catch(() => []),
    ]).then(([p, t, r]) => {
      if (!vigente) return;
      setPlantilla(p);
      setBorrador(p ? structuredClone(estructuraDe(p)) : null);
      setPendientes(new Map());
      // Los tipos creados para las reglas por requerimiento no se extraen en la revisión por carpetas.
      setTipos((t || []).filter((x) => !x.soloReglas));
      setRequerimientos(r || []);
      setError(null);
    }).catch((err) => { if (vigente) setError(err.message || "No se pudo cargar la plantilla."); });
    return () => { vigente = false; };
  }, [mandanteId]);

  // Alcance de la versión guardada (se recalcula al cambiar la versión).
  const plantillaId = plantilla?.id;
  const version = plantilla?.version;
  useEffect(() => {
    if (!plantillaId) return undefined;
    let vigente = true;
    plantillaEstructuraService.alcance(plantillaId)
      .then((a) => { if (vigente) setAlcance(a); })
      .catch(() => { if (vigente) setAlcance(null); });
    return () => { vigente = false; };
  }, [plantillaId, version]);

  const hayCambios = Boolean(plantilla && borrador && JSON.stringify(borrador) !== JSON.stringify(estructuraDe(plantilla)));
  const hayPendientes = pendientes.size > 0;

  // Aviso al salir con cambios sin guardar.
  useEffect(() => {
    if (!hayCambios && !hayPendientes) return undefined;
    const alSalir = (e) => { e.preventDefault(); e.returnValue = ""; return ""; };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [hayCambios, hayPendientes]);

  const aplicar = (p, mensaje, nuevoAlcance = undefined) => {
    setPlantilla(p);
    setBorrador(p ? structuredClone(estructuraDe(p)) : null);
    setPendientes(new Map());
    if (nuevoAlcance !== undefined) setAlcance(nuevoAlcance);
    if (!p) setAlcance(null);
    setAviso(mensaje);
    setPrueba(null);
  };

  const ejecutar = async (accion, mensaje) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const r = await accion();
      if (r && r.plantilla) aplicar(r.plantilla, mensaje, r.alcance);
      else aplicar(r, mensaje);
    } catch (err) {
      setError(err.message || "No se pudo completar la acción.");
    } finally {
      setOcupado(false);
      setConfirmar(null);
    }
  };

  const importarJson = async (archivo) => {
    if (!archivo) return;
    try {
      const datos = JSON.parse(await archivo.text());
      await ejecutar(() => plantillaEstructuraService.importar({ mandanteId, origen: "json", plantilla: datos }), "Plantilla importada.");
    } catch (err) {
      setError(err instanceof SyntaxError ? "El archivo no es un JSON válido." : err.message);
    }
  };

  const probar = async (leida) => {
    if (!leida) return;
    setOcupado(true);
    setError(null);
    try {
      setPrueba(await revisionIAService.analizar({ mandanteId, arbol: leida.arbol }));
    } catch (err) {
      setError(err.message || "No se pudo analizar la carpeta.");
    } finally {
      setOcupado(false);
    }
  };

  const elegirCarpetaPrueba = async () => {
    if (!soportaSelectorCarpeta()) { inputCarpeta.current?.click(); return; }
    try {
      await probar(await elegirConSelector());
    } catch (err) {
      setError(err.message || "No se pudo abrir la carpeta.");
    }
  };

  // --- Habilitación (cambios locales hasta Guardar) ---
  const original = (nivel, seccion, elemento) => (nivel === "seccion" ? seccion.habilitada !== false : elemento.habilitado !== false);
  const valor = (nivel, seccion, elemento = null) => {
    const k = claveCambio(nivel, seccion.clave, elemento?.clave);
    return pendientes.has(k) ? pendientes.get(k) : original(nivel, seccion, elemento);
  };
  const cambiar = (lista) => setPendientes((actual) => {
    const nuevo = new Map(actual);
    lista.forEach(({ nivel, seccion, elemento, habilitado }) => {
      const k = claveCambio(nivel, seccion.clave, elemento?.clave);
      if (habilitado === original(nivel, seccion, elemento)) nuevo.delete(k);
      else nuevo.set(k, habilitado);
    });
    return nuevo;
  });
  const cambiarHijos = (seccion, habilitado) => cambiar(["archivosSeccion", "documentos"].flatMap((lista) =>
    (seccion[lista] || []).map((elemento) => ({ nivel: NIVEL_LISTA[lista], seccion, elemento, habilitado }))));

  const guardarHabilitacion = () => ejecutar(() => plantillaEstructuraService.guardarHabilitacion(plantilla.id,
    [...pendientes.entries()].map(([k, habilitado]) => {
      const [nivel, seccionClave, elementoClave] = k.split("|");
      return { nivel, seccionClave, elementoClave: elementoClave || undefined, habilitado };
    })), "Habilitación guardada (nueva versión).");

  // --- Estructura (borrador) ---
  const cambiarSecciones = (fn) => setBorrador((b) => ({ ...b, secciones: fn(b.secciones) }));
  const alternar = (clave) => setAbiertas((a) => { const n = new Set(a); if (n.has(clave)) n.delete(clave); else n.add(clave); return n; });
  const reqEmpresa = requerimientos.filter((r) => r.tipoEntidad === "empresa");
  const reqPersona = requerimientos.filter((r) => r.tipoEntidad === "persona");
  const nombreReq = new Map(requerimientos.map((r) => [r.id, r.nombre]));

  const guardarDocumento = (seccionClave, lista, originalDoc, doc) => cambiarSecciones((secs) => secs.map((s) => {
    if (s.clave !== seccionClave) return s;
    const docs = s[lista] || [];
    return { ...s, [lista]: originalDoc ? docs.map((x) => (x.clave === originalDoc.clave ? { ...doc, habilitado: x.habilitado } : x)) : [...docs, doc] };
  }));

  return (
    <div className="space-y-6">
      {modo === "seleccionable" && <div className="max-w-sm"><CampoMandante contexto={contexto} conFoco={false} /></div>}
      {modo === "ninguno" && <CampoMandante contexto={contexto} />}
      <ErrorBanner message={error} />
      {aviso && <p role="status" className="text-xs font-semibold text-sage-dark">{aviso}</p>}

      {!mandanteId ? (
        modo === "seleccionable" && <p className="py-8 text-center text-xs text-slate-400">Seleccione un Mandante para ver su plantilla.</p>
      ) : plantilla === undefined ? (
        <div className="h-40 rounded-2xl bg-white border border-slate-100 animate-pulse" aria-hidden="true" />
      ) : !plantilla ? (
        <Tarjeta titulo="Estructura de carpetas" Icono={FolderTree}>
          <p className="text-xs text-slate-500">
            Este Mandante no tiene una plantilla activa. La plantilla describe qué secciones y documentos trae la carpeta de arranque de cada
            empresa y cómo reconocerlos por nombre (la numeración varía entre empresas). Sin plantilla no se puede revisar.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={ocupado} onClick={() => ejecutar(() => plantillaEstructuraService.importar({ mandanteId, origen: "transemel" }), "Plantilla Transemel v1 importada.")} className={CLASE_PRIMARIO}>
              <FolderTree className="w-4 h-4" /> Importar plantilla Transemel v1
            </button>
            <button type="button" disabled={ocupado} onClick={() => inputJson.current?.click()} className={CLASE_SECUNDARIO}>
              <Upload className="w-4 h-4" /> Importar desde archivo JSON
            </button>
            <input ref={inputJson} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { importarJson(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </Tarjeta>
      ) : (
        <>
          <AlcancePanel alcance={alcance} nombreRequerimiento={nombreReq} />

          <Tarjeta
            titulo={`${plantilla.nombre} · versión ${plantilla.version}`}
            Icono={FolderTree}
            acciones={(
              <div className="flex flex-wrap gap-2">
                <span className={`${CLASE_BADGE} bg-sage-lighter text-sage-darker border-sage-light`}>Activa</span>
                <button type="button" disabled={ocupado || hayPendientes || hayCambios} title={hayPendientes || hayCambios ? "Guarde o descarte los cambios primero." : undefined} onClick={() => setConfirmar("deshabilitar_todo")} className={CLASE_SECUNDARIO}>Deshabilitar todo</button>
                <button type="button" disabled={ocupado || hayPendientes || hayCambios} title={hayPendientes || hayCambios ? "Guarde o descarte los cambios primero." : undefined} onClick={() => setConfirmar("habilitar_todo")} className={CLASE_SECUNDARIO}>Habilitar todo</button>
                <button type="button" onClick={() => descargarJson(`plantilla-${plantilla.nombre}-v${plantilla.version}.json`, estructuraDe(plantilla))} className={CLASE_SECUNDARIO}>
                  <Download className="w-4 h-4" /> Exportar JSON
                </button>
                <button type="button" onClick={() => setConfirmar("desactivar")} className={CLASE_SECUNDARIO}>Desactivar</button>
              </div>
            )}
          >
            {hayPendientes && (
              <div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <span className="text-xs font-semibold text-amber-800 mr-auto">{pendientes.size} {pendientes.size === 1 ? "cambio sin guardar" : "cambios sin guardar"}</span>
                <button type="button" onClick={() => setPendientes(new Map())} disabled={ocupado} className={CLASE_SECUNDARIO}>Descartar</button>
                <button type="button" onClick={guardarHabilitacion} disabled={ocupado} className={CLASE_PRIMARIO}>{ocupado ? "Guardando..." : "Guardar"}</button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="px-2 py-2">Habilitada</th>
                    <th className="px-2 py-2" />
                    <th className="px-2 py-2">Sección</th>
                    <th className="px-2 py-2">Alias</th>
                    <th className="px-2 py-2">Oblig.</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2">Entidad / rol</th>
                    <th className="px-2 py-2">Cardinalidad</th>
                    <th className="px-2 py-2 text-right">Docs</th>
                    <th className="px-2 py-2">Requerimiento</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {borrador.secciones.map((s) => {
                    const guardada = plantilla.secciones.find((x) => x.clave === s.clave);
                    const habilitada = guardada ? valor("seccion", guardada) : s.habilitada !== false;
                    const abierta = abiertas.has(s.clave);
                    const Flecha = abierta ? ChevronDown : ChevronRight;
                    const hijos = ["archivosSeccion", "documentos"].flatMap((lista) => (s[lista] || []).map((d) => ({ lista, d })));
                    const hijosHabilitados = hijos.filter(({ lista, d }) => {
                      const g = guardada?.[lista]?.find((x) => x.clave === d.clave);
                      return g ? valor(NIVEL_LISTA[lista], guardada, g) : d.habilitado !== false;
                    }).length;
                    const listas = [["archivosSeccion", "Archivos sueltos de la sección"], ["documentos", s.tipo === "entidades" ? "Documentos de cada entidad" : "Documentos"]];
                    const switchBloqueado = hayCambios || !guardada;
                    return (
                      <Fragment key={s.clave}>
                        <tr className={`align-top ${habilitada ? "" : "opacity-50"}`}>
                          <td className="px-2 py-2">
                            <Switch
                              activo={habilitada} etiqueta={`Habilitar ${s.nombre}`} deshabilitado={switchBloqueado || ocupado}
                              titulo={hayCambios ? MSG_HAY_ESTRUCTURA : !guardada ? "Guarde la sección nueva antes de habilitarla." : undefined}
                              onChange={(v) => cambiar([{ nivel: "seccion", seccion: guardada, habilitado: v }])}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <button type="button" onClick={() => alternar(s.clave)} aria-expanded={abierta} aria-label={`Documentos de ${s.nombre}`} className="p-1 text-slate-400 hover:text-carbon-dark"><Flecha className="w-4 h-4" /></button>
                          </td>
                          <td className="px-2 py-2 font-bold text-carbon-dark">
                            {s.nombre}
                            {!habilitada && <span className={`${CLASE_BADGE} ml-2 bg-slate-100 text-slate-500 border-slate-200`}>Deshabilitada</span>}
                            <span className="block text-[10px] font-mono text-slate-400">{s.clave}{s.numeroSugerido ? ` · n° ${s.numeroSugerido}` : ""}</span>
                          </td>
                          <td className="px-2 py-2 max-w-72"><Chips valores={s.alias} /></td>
                          <td className="px-2 py-2">{s.obligatoria ? "Sí" : "No"}</td>
                          <td className="px-2 py-2">{ETIQUETA_TIPO[s.tipo]}</td>
                          <td className="px-2 py-2">{s.entidad ? `${s.entidad}${s.rolEntidad ? ` · ${s.rolEntidad}` : ""}` : "—"}</td>
                          <td className="px-2 py-2">{s.cardinalidad?.min ?? 0} – {s.cardinalidad?.max ?? "∞"}</td>
                          <td className="px-2 py-2 text-right whitespace-nowrap">{hijosHabilitados} / {hijos.length}</td>
                          <td className="px-2 py-2 text-slate-500">{s.requerimientoId ? nombreReq.get(s.requerimientoId) || "—" : "—"}</td>
                          <td className="px-2 py-2 text-right whitespace-nowrap">
                            <button type="button" disabled={hayPendientes} title={hayPendientes ? MSG_HAY_PENDIENTES : undefined} onClick={() => setModal({ tipo: "seccion", seccion: s })} aria-label={`Editar ${s.nombre}`} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary-lighter disabled:opacity-40"><Pencil className="w-4 h-4" /></button>
                            <button type="button" disabled={hayPendientes} title={hayPendientes ? MSG_HAY_PENDIENTES : undefined} onClick={() => setConfirmar({ quitarSeccion: s })} aria-label={`Quitar ${s.nombre}`} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                        {abierta && (
                          <tr className={`bg-slate-50/60 ${habilitada ? "" : "opacity-60"}`}>
                            <td />
                            <td colSpan={10} className="px-2 py-3 space-y-3">
                              {s.nota && <p className="text-[11px] text-slate-500">{s.nota}</p>}
                              {guardada && hijos.length > 0 && (
                                <div className="flex flex-wrap gap-3">
                                  <button type="button" disabled={!habilitada || hayCambios || ocupado} title={!habilitada ? "La sección está deshabilitada" : hayCambios ? MSG_HAY_ESTRUCTURA : undefined} onClick={() => cambiarHijos(guardada, true)} className="text-[11px] font-bold text-primary hover:text-primary-dark disabled:opacity-40">Habilitar todos</button>
                                  <button type="button" disabled={!habilitada || hayCambios || ocupado} title={!habilitada ? "La sección está deshabilitada" : hayCambios ? MSG_HAY_ESTRUCTURA : undefined} onClick={() => cambiarHijos(guardada, false)} className="text-[11px] font-bold text-primary hover:text-primary-dark disabled:opacity-40">Deshabilitar todos</button>
                                </div>
                              )}
                              {listas.filter(([lista]) => lista === "documentos" || s.tipo !== "archivos" || (s.archivosSeccion || []).length).map(([lista, titulo]) => (
                                <div key={lista} className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-auto">{titulo}</p>
                                    <button type="button" disabled={hayPendientes} title={hayPendientes ? MSG_HAY_PENDIENTES : undefined} onClick={() => setModal({ tipo: "documento", seccion: s, lista })} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary-dark disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Agregar</button>
                                  </div>
                                  {(s[lista] || []).length === 0 ? <p className="text-[11px] text-slate-400">Sin documentos.</p> : (
                                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 bg-white">
                                      {s[lista].map((d) => {
                                        const g = guardada?.[lista]?.find((x) => x.clave === d.clave);
                                        const docHabilitado = g ? valor(NIVEL_LISTA[lista], guardada, g) : d.habilitado !== false;
                                        return (
                                          <li key={d.clave} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-[11px] ${docHabilitado && habilitada ? "" : "opacity-50"}`}>
                                            <Switch
                                              activo={docHabilitado} etiqueta={`Habilitar ${d.nombre}`}
                                              deshabilitado={!habilitada || !g || hayCambios || ocupado}
                                              titulo={!habilitada ? "La sección está deshabilitada" : hayCambios ? MSG_HAY_ESTRUCTURA : !g ? "Guarde el documento nuevo antes de habilitarlo." : undefined}
                                              onChange={(v) => cambiar([{ nivel: NIVEL_LISTA[lista], seccion: guardada, elemento: g, habilitado: v }])}
                                            />
                                            <span className="font-bold text-carbon-dark min-w-40">{d.nombre}</span>
                                            <Chips valores={d.alias} />
                                            {d.excluir?.length > 0 && <Chips valores={d.excluir.map((x) => `no: ${x}`)} clase="bg-red-50 text-red-700" />}
                                            <span className="ml-auto flex flex-wrap items-center gap-2 text-slate-500">
                                              {d.obligatorio && <span>Obligatorio</span>}
                                              {d.multiple && <span>Múltiple</span>}
                                              {d.tipoDocumentalCodigo && <span className="inline-flex items-center gap-0.5 text-primary font-semibold"><Sparkles className="w-3 h-3" />{d.tipoDocumentalCodigo}</span>}
                                              {d.datosSensibles && <span className="inline-flex items-center gap-0.5 text-amber-700 font-semibold"><ShieldAlert className="w-3 h-3" />Sensible</span>}
                                              {d.requerimientoId && <span>{nombreReq.get(d.requerimientoId) || "Requerimiento"}</span>}
                                              <button type="button" disabled={hayPendientes} title={hayPendientes ? MSG_HAY_PENDIENTES : undefined} onClick={() => setModal({ tipo: "documento", seccion: s, lista, documento: d })} aria-label={`Editar ${d.nombre}`} className="p-1 rounded text-slate-400 hover:text-primary disabled:opacity-40"><Pencil className="w-3.5 h-3.5" /></button>
                                              <button type="button" disabled={hayPendientes} title={hayPendientes ? MSG_HAY_PENDIENTES : undefined} onClick={() => setConfirmar({ quitarDocumento: { seccion: s, lista, documento: d } })} aria-label={`Quitar ${d.nombre}`} className="p-1 rounded text-slate-400 hover:text-red-600 disabled:opacity-40"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  )}
                                </div>
                              ))}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={hayPendientes} title={hayPendientes ? MSG_HAY_PENDIENTES : undefined} onClick={() => setModal({ tipo: "seccion" })} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-dark disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Agregar sección</button>
              <span className="ml-auto" />
              {hayCambios && <button type="button" onClick={() => aplicar(plantilla, null)} disabled={ocupado} className={CLASE_SECUNDARIO}>Descartar cambios</button>}
              <button type="button" onClick={() => ejecutar(() => plantillaEstructuraService.actualizar(plantilla.id, borrador), "Plantilla guardada (nueva versión).")} disabled={!hayCambios || ocupado} className={CLASE_PRIMARIO}>
                {ocupado ? "Guardando..." : "Guardar cambios de estructura"}
              </button>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Probar con una carpeta" Icono={FolderSearch}>
            <p className="text-[11px] text-slate-500">
              Analiza una carpeta con la plantilla guardada, sin crear una revisión, para ajustar los alias.
              {(hayCambios || hayPendientes) && " Hay cambios sin guardar: la prueba usa la versión guardada."}
            </p>
            <button type="button" onClick={elegirCarpetaPrueba} disabled={ocupado} className={CLASE_SECUNDARIO}>
              <FolderSearch className="w-4 h-4" /> {ocupado ? "Analizando..." : "Elegir carpeta"}
            </button>
            <input ref={inputCarpeta} type="file" multiple className="hidden" webkitdirectory="" directory="" onChange={(e) => { probar(leerArbolDesdeInput(e.target.files)); e.target.value = ""; }} />
            {prueba && <ResultadoPrueba plan={prueba} secciones={plantilla.secciones} />}
          </Tarjeta>
        </>
      )}

      {modal?.tipo === "seccion" && (
        <SeccionModal
          seccion={modal.seccion || null}
          clavesUsadas={borrador.secciones.map((s) => s.clave)}
          requerimientos={reqEmpresa}
          onCancelar={() => setModal(null)}
          onGuardar={(seccion) => {
            cambiarSecciones((secs) => (modal.seccion ? secs.map((s) => (s.clave === seccion.clave ? { ...seccion, habilitada: s.habilitada } : s)) : [...secs, seccion]));
            setModal(null);
          }}
        />
      )}
      {modal?.tipo === "documento" && (
        <DocumentoModal
          documento={modal.documento || null}
          clavesUsadas={[...(modal.seccion.archivosSeccion || []), ...(modal.seccion.documentos || [])].map((d) => d.clave)}
          tiposDocumentales={tipos}
          requerimientos={modal.seccion.entidad === "persona" && modal.lista === "documentos" ? reqPersona : reqEmpresa}
          onCancelar={() => setModal(null)}
          onGuardar={(doc) => {
            guardarDocumento(modal.seccion.clave, modal.lista, modal.documento, doc);
            setModal(null);
          }}
        />
      )}
      {(confirmar === "deshabilitar_todo" || confirmar === "habilitar_todo") && (
        <ConfirmacionModal
          titulo={confirmar === "deshabilitar_todo" ? "Deshabilitar toda la plantilla" : "Habilitar toda la plantilla"}
          mensaje={confirmar === "deshabilitar_todo"
            ? "Se deshabilitan todas las secciones, archivos sueltos y documentos. Después habilite lo que quiera revisar."
            : "Se habilitan todas las secciones, archivos sueltos y documentos."}
          textoConfirmar={confirmar === "deshabilitar_todo" ? "Deshabilitar todo" : "Habilitar todo"}
          peligro={confirmar === "deshabilitar_todo"}
          ocupado={ocupado}
          onConfirmar={() => ejecutar(() => plantillaEstructuraService.habilitacionMasiva(plantilla.id, confirmar), "Habilitación guardada (nueva versión).")}
          onCancelar={() => setConfirmar(null)}
        />
      )}
      {confirmar === "desactivar" && (
        <ConfirmacionModal
          titulo="Desactivar la plantilla"
          mensaje="Sin plantilla activa no se pueden hacer revisiones de este Mandante. La plantilla se conserva."
          textoConfirmar="Desactivar"
          peligro
          ocupado={ocupado}
          onConfirmar={() => ejecutar(() => plantillaEstructuraService.desactivar(plantilla.id).then(() => null), "Plantilla desactivada.")}
          onCancelar={() => setConfirmar(null)}
        />
      )}
      {confirmar?.quitarSeccion && (
        <ConfirmacionModal
          titulo="Quitar la sección"
          mensaje={`Se quitará ${confirmar.quitarSeccion.nombre} de la plantilla al guardar los cambios.`}
          textoConfirmar="Quitar"
          peligro
          onConfirmar={() => { cambiarSecciones((secs) => secs.filter((s) => s.clave !== confirmar.quitarSeccion.clave)); setConfirmar(null); }}
          onCancelar={() => setConfirmar(null)}
        />
      )}
      {confirmar?.quitarDocumento && (
        <ConfirmacionModal
          titulo="Quitar el documento"
          mensaje={`Se quitará ${confirmar.quitarDocumento.documento.nombre} de la sección al guardar los cambios.`}
          textoConfirmar="Quitar"
          peligro
          onConfirmar={() => {
            const { seccion, lista, documento } = confirmar.quitarDocumento;
            cambiarSecciones((secs) => secs.map((s) => (s.clave === seccion.clave ? { ...s, [lista]: s[lista].filter((d) => d.clave !== documento.clave) } : s)));
            setConfirmar(null);
          }}
          onCancelar={() => setConfirmar(null)}
        />
      )}
    </div>
  );
};
