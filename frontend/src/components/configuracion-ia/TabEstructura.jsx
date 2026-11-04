import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown, ArrowUp, Archive, ChevronDown, ChevronRight, Copy, Download, FolderSearch, FolderTree, Link2, Pencil, Plus,
  RotateCcw, ShieldAlert, Sparkles, Tag, Upload, X,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useMandanteContexto } from "../../hooks/useMandanteContexto";
import { CampoMandante } from "../shared/CampoMandante";
import { ErrorBanner } from "../shared/ErrorBanner";
import { IconoTipoEntidad } from "../shared/IconoTipoEntidad";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { AlcancePanel } from "../revisiones-ia/AlcancePanel";
import { plantillaEstructuraService } from "../../services/plantillaEstructuraService";
import { mapeoRequerimientoService } from "../../services/mapeoRequerimientoService";
import { ubicacionExpedienteService } from "../../services/ubicacionExpedienteService";
import { revisionIAService } from "../../services/revisionIAService";
import { requerimientoService } from "../../services/requerimientoService";
import { mandanteService } from "../../services/mandanteService";
import { soportaSelectorCarpeta, elegirConSelector, leerArbolDesdeInput } from "../../services/fuentes/carpetaLocal";
import { CLASE_BADGE, ESTADO_COMPLETITUD } from "../../utils/revisionIA";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { Tarjeta } from "./Tarjeta";
import { SeccionModal, DocumentoModal } from "./EditorPlantillaModales";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO, TIPOS_SECCION } from "./estilos";

const ETIQUETA_TIPO = Object.fromEntries(TIPOS_SECCION.map((t) => [t.value, t.label.split(" (")[0]]));
const NIVEL_LISTA = { archivosSeccion: "archivoSeccion", documentos: "documento" };
// Nivel de requerimiento que acepta cada nodo (igual que el backend): secciones y archivos
// sueltos → Empresa; documentos de una sección de entidades → Persona o Maquinaria.
const TIPO_ENTIDAD_REQ = { empresa: "empresa", persona: "persona", maquinaria: "recurso" };
const ETIQUETA_NIVEL = { empresa: "Empresa", persona: "Persona", maquinaria: "Maquinaria" };
const nivelDoc = (s, lista) => (lista === "documentos" && s.tipo === "entidades" ? (s.entidad === "maquinaria" ? "maquinaria" : "persona") : "empresa");
const claveCambio = (nivel, seccionClave, elementoClave = "") => `${nivel}|${seccionClave}|${elementoClave}`;
const estructuraDe = (p) => (p ? { nombre: p.nombre, profundidadSubcontratos: p.profundidadSubcontratos, secciones: p.secciones } : null);
const retirado = (n) => n?.estado === "retirado";
const MSG_HAY_ESTRUCTURA = "Guarde o descarte los cambios de estructura antes de cambiar la habilitación.";
const MSG_HAY_PENDIENTES = "Guarde o descarte los cambios de habilitación antes de editar la estructura.";
const BOTON_ICONO = "p-1 rounded text-slate-400 hover:text-primary disabled:opacity-30";

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
        </div>
      ))}
    </div>
  );
};

// Selector buscable de requerimientos compatibles (nivel del nodo, mismo Mandante, no vinculados).
// Se cierra con la X, con Escape o con un clic fuera de él (`anclaRef`: el contenedor del botón
// "Vincular", que ya alterna el selector por su cuenta). Se dibuja en el body, fijo bajo el botón,
// para quedar por encima de las otras filas de la tabla (y seguirlo al desplazar).
const ANCHO_SELECTOR = 288;
const SelectorRequerimiento = ({ opciones, nivel, onElegir, onCerrar, anclaRef }) => {
  const [texto, setTexto] = useState("");
  const cajaRef = useRef(null);
  const cerrarRef = useRef(onCerrar);
  useEffect(() => { cerrarRef.current = onCerrar; });
  useEffect(() => {
    const alPresionar = (e) => {
      if (cajaRef.current?.contains(e.target) || anclaRef?.current?.contains(e.target)) return;
      cerrarRef.current();
    };
    const alTeclear = (e) => { if (e.key === "Escape") cerrarRef.current(); };
    document.addEventListener("mousedown", alPresionar);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alPresionar);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [anclaRef]);
  useLayoutEffect(() => {
    const ubicar = () => {
      const caja = cajaRef.current;
      const r = anclaRef?.current?.getBoundingClientRect();
      if (!caja || !r) return;
      caja.style.top = `${r.bottom + 4}px`;
      caja.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - ANCHO_SELECTOR - 8))}px`;
    };
    ubicar();
    window.addEventListener("scroll", ubicar, true);
    window.addEventListener("resize", ubicar);
    return () => {
      window.removeEventListener("scroll", ubicar, true);
      window.removeEventListener("resize", ubicar);
    };
  }, [anclaRef]);
  const t = texto.trim().toLowerCase();
  const lista = opciones.filter((r) => !t || `${r.nombreCorto || ""} ${r.nombre}`.toLowerCase().includes(t));
  return createPortal(
    <div ref={cajaRef} style={{ width: ANCHO_SELECTOR }} className="fixed z-[70] rounded-xl border border-slate-200 bg-white shadow-dropdown p-2 space-y-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar requerimiento" aria-label="Buscar requerimiento"
          className="flex-1 px-2 py-1 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:ring-2 focus:ring-primary/20" />
        <button type="button" onClick={onCerrar} aria-label="Cerrar" title="Cerrar (Esc)"
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-carbon-dark"><X className="w-4 h-4" /></button>
      </div>
      <p className="flex items-center gap-1.5 px-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <IconoTipoEntidad tipo={nivel} className="w-3.5 h-3.5 text-primary" /> Requerimientos de {ETIQUETA_NIVEL[nivel]} ({opciones.length})
      </p>
      <ul className="max-h-64 overflow-y-auto">
        {lista.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onElegir(r)} className="w-full flex items-center gap-1.5 text-left px-2 py-1 rounded-lg text-[11px] text-carbon-dark hover:bg-primary-lighter">
              <IconoTipoEntidad tipo={r.tipoEntidad} />
              <span className="min-w-0 truncate" title={r.nombre}>{r.nombreCorto || r.nombre}</span>
            </button>
          </li>
        ))}
        {!lista.length && <li className="px-2 py-1 text-[11px] text-slate-400">Sin requerimientos compatibles.</li>}
      </ul>
    </div>,
    document.body,
  );
};

// Columna Requerimiento de un nodo: chips de los vinculados, indicador "Sin requerimiento", vínculos
// inactivos por retiro, alias sugeridos pendientes y (superadmin) vincular / desvincular.
const RequerimientosNodo = ({ nodoClave, nivel, guardado, activo, habilitado, vinculos, requerimientos, puedeEditar, ocupado, sugeridos, onVincular, onDesvincular, onVerSugeridos }) => {
  const [abierto, setAbierto] = useState(false);
  const anclaRef = useRef(null);
  const activos = vinculos.filter((v) => v.nodoClave === nodoClave && v.estado === "activo");
  const inactivosPorRetiro = vinculos.filter((v) => v.nodoClave === nodoClave && v.estado === "inactivo" && v.motivoInactivo === "nodo_retirado").length;
  const porId = new Map(requerimientos.map((r) => [r.id, r]));
  const vinculados = new Set(activos.map((v) => v.requerimientoId));
  const opciones = requerimientos.filter((r) => r.tipoEntidad === TIPO_ENTIDAD_REQ[nivel] && !vinculados.has(r.id));
  return (
    <span className="relative inline-flex flex-wrap items-center gap-1">
      {activos.map((v) => {
        const r = porId.get(v.requerimientoId);
        return (
          <span key={v.requerimientoId} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary-lighter text-primary-dark">
            {r && <IconoTipoEntidad tipo={r.tipoEntidad} className="w-3 h-3 shrink-0 text-primary/70" />}
            {r ? r.nombreCorto || r.nombre : "Requerimiento"}
            {puedeEditar && <button type="button" disabled={ocupado} onClick={() => onDesvincular(nodoClave, v.requerimientoId)} aria-label="Desvincular" className="text-primary/60 hover:text-red-600"><X className="w-3 h-3" /></button>}
          </span>
        );
      })}
      {guardado && activo && habilitado && !activos.length && (
        <span className={`${CLASE_BADGE} bg-amber-50 text-amber-700 border-amber-200`}>Sin requerimiento</span>
      )}
      {inactivosPorRetiro > 0 && (
        <span className="text-[10px] text-slate-400">{inactivosPorRetiro} {inactivosPorRetiro === 1 ? "vínculo inactivo" : "vínculos inactivos"} (nodo retirado)</span>
      )}
      {sugeridos > 0 && (
        <button type="button" onClick={() => onVerSugeridos(nodoClave)} className={`${CLASE_BADGE} bg-sky-50 text-sky-700 border-sky-200 inline-flex items-center gap-0.5`}>
          <Tag className="w-3 h-3" /> Alias sugeridos ({sugeridos})
        </button>
      )}
      {puedeEditar && guardado && activo && (
        <span ref={anclaRef} className="inline-flex">
          <button type="button" disabled={ocupado} onClick={() => setAbierto((v) => !v)} title={`Vincular un requerimiento de nivel ${ETIQUETA_NIVEL[nivel]}`}
            aria-expanded={abierto} className="inline-flex items-center gap-0.5 text-[10px] font-bold text-primary hover:underline disabled:opacity-40">
            <Link2 className="w-3 h-3" /> Vincular
          </button>
        </span>
      )}
      {abierto && (
        <SelectorRequerimiento opciones={opciones} nivel={nivel} anclaRef={anclaRef} onCerrar={() => setAbierto(false)}
          onElegir={(r) => { setAbierto(false); onVincular(nodoClave, r.id); }} />
      )}
    </span>
  );
};

// Pestaña "Mapeo documental" (plantilla de estructura del Mandante): qué secciones, archivos sueltos
// y documentos de entidad se esperan en la carpeta de cada empresa, cómo reconocerlos (alias, con
// exclusiones) y a qué requerimientos corresponden (vínculo N:N, aparte de la plantilla: vincular
// no crea versión). Solo superadmin edita; evaluador, mandante_admin y mandante_lector la ven.
// Los cambios de habilitación se acumulan y se guardan juntos; los de estructura (agregar, editar,
// retirar, reactivar, reordenar) también, en una versión nueva.
export const TabEstructura = () => {
  const { profile } = useAuth();
  const puedeEditar = profile?.rol === "superadmin";
  const contexto = useMandanteContexto();
  const { mandanteId, modo } = contexto;
  const [plantilla, setPlantilla] = useState(undefined);
  const [borrador, setBorrador] = useState(null);
  const [alcance, setAlcance] = useState(null);
  const [pendientes, setPendientes] = useState(() => new Map());
  const [tipos, setTipos] = useState([]);
  const [requerimientos, setRequerimientos] = useState([]);
  const [vinculos, setVinculos] = useState([]);
  const [sugerencias, setSugerencias] = useState([]);
  const [abiertas, setAbiertas] = useState(() => new Set());
  const [verRetirados, setVerRetirados] = useState(false);
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
      mapeoRequerimientoService.listar(mandanteId).catch(() => []),
      ubicacionExpedienteService.listarAliasSugeridos(mandanteId, "pendiente").catch(() => []),
    ]).then(([p, t, r, v, s]) => {
      if (!vigente) return;
      setPlantilla(p);
      setBorrador(p ? structuredClone(estructuraDe(p)) : null);
      setPendientes(new Map());
      // Los tipos creados para las reglas por requerimiento no se extraen en la revisión por carpetas.
      setTipos((t || []).filter((x) => !x.soloReglas));
      setRequerimientos(r || []);
      setVinculos(v || []);
      setSugerencias(s || []);
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
      // Retirar o reactivar nodos cambia el estado de sus vínculos.
      setVinculos(await mapeoRequerimientoService.listar(mandanteId).catch(() => vinculos));
    } catch (err) {
      setError(err.message || "No se pudo completar la acción.");
    } finally {
      setOcupado(false);
      setConfirmar(null);
    }
  };

  // Vincular / desvincular: inmediato (no es parte del borrador ni crea versión).
  const cambiarVinculo = async (accion, nodoClave, requerimientoId) => {
    setOcupado(true);
    setError(null);
    try {
      await mapeoRequerimientoService[accion]({ mandanteId, nodoClave, requerimientoId });
      setVinculos(await mapeoRequerimientoService.listar(mandanteId));
    } catch (err) {
      setError(err.message || "No se pudo actualizar el vínculo.");
    } finally {
      setOcupado(false);
    }
  };

  const resolverSugerencia = async (s, decision) => {
    setOcupado(true);
    setError(null);
    try {
      await ubicacionExpedienteService.resolverAliasSugerido(s.id, decision);
      const [p, lista] = await Promise.all([plantillaEstructuraService.obtenerActiva(mandanteId),
        ubicacionExpedienteService.listarAliasSugeridos(mandanteId, "pendiente")]);
      setSugerencias(lista || []);
      if (decision === "aprobado") aplicar(p, `Alias «${s.alias}» agregado (nueva versión).`);
    } catch (err) {
      setError(err.message || "No se pudo resolver la sugerencia.");
    } finally {
      setOcupado(false);
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
    (seccion[lista] || []).filter((e) => !retirado(e)).map((elemento) => ({ nivel: NIVEL_LISTA[lista], seccion, elemento, habilitado }))));

  const guardarHabilitacion = () => ejecutar(() => plantillaEstructuraService.guardarHabilitacion(plantilla.id,
    [...pendientes.entries()].map(([k, habilitado]) => {
      const [nivel, seccionClave, elementoClave] = k.split("|");
      return { nivel, seccionClave, elementoClave: elementoClave || undefined, habilitado };
    })), "Habilitación guardada (nueva versión).");

  // --- Estructura (borrador) ---
  const cambiarSecciones = (fn) => setBorrador((b) => ({ ...b, secciones: fn(b.secciones) }));
  const alternar = (clave) => setAbiertas((a) => { const n = new Set(a); if (n.has(clave)) n.delete(clave); else n.add(clave); return n; });
  const nombreReq = new Map(requerimientos.map((r) => [r.id, r.nombre]));
  const mover = (lista, i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= lista.length) return lista;
    const copia = [...lista];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    return copia;
  };
  const moverSeccion = (clave, delta) => cambiarSecciones((secs) => mover(secs, secs.findIndex((s) => s.clave === clave), delta));
  const moverDocumento = (seccionClave, lista, clave, delta) => cambiarSecciones((secs) => secs.map((s) => (s.clave !== seccionClave ? s
    : { ...s, [lista]: mover(s[lista] || [], (s[lista] || []).findIndex((d) => d.clave === clave), delta) })));
  const estadoSeccion = (clave, estado) => cambiarSecciones((secs) => secs.map((s) => (s.clave === clave ? { ...s, estado } : s)));
  const estadoDocumento = (seccionClave, lista, clave, estado) => cambiarSecciones((secs) => secs.map((s) => (s.clave !== seccionClave ? s
    : { ...s, [lista]: (s[lista] || []).map((d) => (d.clave === clave ? { ...d, estado } : d)) })));

  const guardarDocumento = (seccionClave, lista, originalDoc, doc) => cambiarSecciones((secs) => secs.map((s) => {
    if (s.clave !== seccionClave) return s;
    const docs = s[lista] || [];
    return { ...s, [lista]: originalDoc ? docs.map((x) => (x.clave === originalDoc.clave ? { ...doc, habilitado: x.habilitado } : x)) : [...docs, doc] };
  }));
  const sugeridosDe = (nodoClave) => sugerencias.filter((x) => x.nodoClave === nodoClave).length;
  const requerimientosNodo = (props) => (
    <RequerimientosNodo vinculos={vinculos} requerimientos={requerimientos} puedeEditar={puedeEditar} ocupado={ocupado}
      onVincular={(n, r) => cambiarVinculo("vincular", n, r)} onDesvincular={(n, r) => cambiarVinculo("desvincular", n, r)}
      onVerSugeridos={(n) => setModal({ tipo: "sugeridos", nodoClave: n })} sugeridos={sugeridosDe(props.nodoClave)} {...props} />
  );
  const retiradas = borrador ? borrador.secciones.filter(retirado).length : 0;

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
        <Tarjeta titulo="Mapeo documental" Icono={FolderTree}>
          <p className="text-xs text-slate-500">
            Este Mandante no tiene una plantilla activa. La plantilla describe qué secciones y documentos trae la carpeta de cada
            empresa y cómo reconocerlos por nombre (la numeración varía entre empresas); cada requerimiento se ubica vinculándolo a sus nodos.
          </p>
          {puedeEditar ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={ocupado} onClick={() => ejecutar(() => plantillaEstructuraService.importar({ mandanteId, origen: "transemel" }), "Plantilla Transemel v1 importada.")} className={CLASE_PRIMARIO}>
                <FolderTree className="w-4 h-4" /> Importar plantilla Transemel v1
              </button>
              <button type="button" disabled={ocupado} onClick={() => inputJson.current?.click()} className={CLASE_SECUNDARIO}>
                <Upload className="w-4 h-4" /> Importar desde archivo JSON
              </button>
              <input ref={inputJson} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { importarJson(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          ) : <p className="text-xs text-slate-400">Un superadmin debe importarla.</p>}
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
                {!puedeEditar && <span className={`${CLASE_BADGE} bg-slate-50 text-slate-500 border-slate-200`}>Solo lectura</span>}
                {puedeEditar && (
                  <>
                    <button type="button" disabled={ocupado || hayPendientes || hayCambios} title={hayPendientes || hayCambios ? "Guarde o descarte los cambios primero." : undefined} onClick={() => setConfirmar("deshabilitar_todo")} className={CLASE_SECUNDARIO}>Deshabilitar todo</button>
                    <button type="button" disabled={ocupado || hayPendientes || hayCambios} title={hayPendientes || hayCambios ? "Guarde o descarte los cambios primero." : undefined} onClick={() => setConfirmar("habilitar_todo")} className={CLASE_SECUNDARIO}>Habilitar todo</button>
                  </>
                )}
                <button type="button" onClick={() => descargarJson(`plantilla-${plantilla.nombre}-v${plantilla.version}.json`, estructuraDe(plantilla))} className={CLASE_SECUNDARIO}>
                  <Download className="w-4 h-4" /> Exportar JSON
                </button>
                {puedeEditar && (
                  <>
                    <button type="button" onClick={() => setModal({ tipo: "duplicar" })} className={CLASE_SECUNDARIO}><Copy className="w-4 h-4" /> Duplicar plantilla</button>
                    <button type="button" onClick={() => setConfirmar("desactivar")} className={CLASE_SECUNDARIO}>Desactivar</button>
                  </>
                )}
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

            {retiradas > 0 || borrador.secciones.some((s) => [...(s.archivosSeccion || []), ...(s.documentos || [])].some(retirado)) ? (
              <label className="inline-flex items-center gap-2 text-[11px] text-slate-600">
                <input type="checkbox" checked={verRetirados} onChange={(e) => setVerRetirados(e.target.checked)} className="rounded text-primary" /> Ver retirados
              </label>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[72rem] text-left text-xs">
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
                  {borrador.secciones.map((s, indice) => {
                    if (retirado(s) && !verRetirados) return null;
                    const guardada = plantilla.secciones.find((x) => x.clave === s.clave);
                    const activaGuardada = guardada && !retirado(guardada);
                    const habilitada = guardada ? valor("seccion", guardada) : s.habilitada !== false;
                    const abierta = abiertas.has(s.clave);
                    const Flecha = abierta ? ChevronDown : ChevronRight;
                    const hijos = ["archivosSeccion", "documentos"].flatMap((lista) => (s[lista] || []).filter((d) => !retirado(d)).map((d) => ({ lista, d })));
                    const hijosHabilitados = hijos.filter(({ lista, d }) => {
                      const g = guardada?.[lista]?.find((x) => x.clave === d.clave);
                      return g ? valor(NIVEL_LISTA[lista], guardada, g) : d.habilitado !== false;
                    }).length;
                    const listas = [["archivosSeccion", "Archivos sueltos de la sección"], ["documentos", s.tipo === "entidades" ? "Documentos de cada entidad" : "Documentos"]];
                    const switchBloqueado = !puedeEditar || hayCambios || !guardada || retirado(s);
                    return (
                      <Fragment key={s.clave}>
                        <tr className={`align-top ${habilitada && !retirado(s) ? "" : "opacity-50"}`}>
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
                            {retirado(s) && <span className={`${CLASE_BADGE} ml-2 bg-slate-100 text-slate-500 border-slate-200`}>Retirada</span>}
                            {!habilitada && !retirado(s) && <span className={`${CLASE_BADGE} ml-2 bg-slate-100 text-slate-500 border-slate-200`}>Deshabilitada</span>}
                            <span className="block text-[10px] font-mono text-slate-400">{s.clave}{s.numeroSugerido ? ` · n° ${s.numeroSugerido}` : ""}</span>
                          </td>
                          <td className="px-2 py-2 max-w-72"><Chips valores={s.alias} /></td>
                          <td className="px-2 py-2">{s.obligatoria ? "Sí" : "No"}</td>
                          <td className="px-2 py-2">{ETIQUETA_TIPO[s.tipo]}</td>
                          <td className="px-2 py-2">{s.entidad ? `${s.entidad}${s.rolEntidad ? ` · ${s.rolEntidad}` : ""}` : "—"}</td>
                          <td className="px-2 py-2">{s.cardinalidad?.min ?? 0} – {s.cardinalidad?.max ?? "∞"}</td>
                          <td className="px-2 py-2 text-right whitespace-nowrap">{hijosHabilitados} / {hijos.length}</td>
                          <td className="px-2 py-2">
                            {requerimientosNodo({ nodoClave: s.clave, nivel: "empresa", guardado: Boolean(guardada), activo: activaGuardada, habilitado: habilitada })}
                          </td>
                          <td className="px-2 py-2 text-right whitespace-nowrap">
                            {puedeEditar && (
                              <>
                                <button type="button" disabled={hayPendientes || indice === 0} onClick={() => moverSeccion(s.clave, -1)} aria-label={`Subir ${s.nombre}`} className={BOTON_ICONO}><ArrowUp className="w-3.5 h-3.5" /></button>
                                <button type="button" disabled={hayPendientes || indice === borrador.secciones.length - 1} onClick={() => moverSeccion(s.clave, 1)} aria-label={`Bajar ${s.nombre}`} className={BOTON_ICONO}><ArrowDown className="w-3.5 h-3.5" /></button>
                                {!retirado(s) && <button type="button" disabled={hayPendientes} title={hayPendientes ? MSG_HAY_PENDIENTES : undefined} onClick={() => setModal({ tipo: "seccion", seccion: s })} aria-label={`Editar ${s.nombre}`} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary-lighter disabled:opacity-40"><Pencil className="w-4 h-4" /></button>}
                                {retirado(s)
                                  ? <button type="button" disabled={hayPendientes} onClick={() => estadoSeccion(s.clave, "activo")} aria-label={`Reactivar ${s.nombre}`} className="p-1.5 rounded-lg text-slate-400 hover:text-sage-dark hover:bg-sage-lighter disabled:opacity-40"><RotateCcw className="w-4 h-4" /></button>
                                  : <button type="button" disabled={hayPendientes} title={hayPendientes ? MSG_HAY_PENDIENTES : "Retirar (no se borra)"} onClick={() => setConfirmar({ retirarSeccion: s })} aria-label={`Retirar ${s.nombre}`} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"><Archive className="w-4 h-4" /></button>}
                              </>
                            )}
                          </td>
                        </tr>
                        {abierta && (
                          <tr className={`bg-slate-50/60 ${habilitada ? "" : "opacity-60"}`}>
                            <td />
                            <td colSpan={10} className="px-2 py-3 space-y-3">
                              {s.nota && <p className="text-[11px] text-slate-500">{s.nota}</p>}
                              {puedeEditar && guardada && hijos.length > 0 && !retirado(s) && (
                                <div className="flex flex-wrap gap-3">
                                  <button type="button" disabled={!habilitada || hayCambios || ocupado} title={!habilitada ? "La sección está deshabilitada" : hayCambios ? MSG_HAY_ESTRUCTURA : undefined} onClick={() => cambiarHijos(guardada, true)} className="text-[11px] font-bold text-primary hover:text-primary-dark disabled:opacity-40">Habilitar todos</button>
                                  <button type="button" disabled={!habilitada || hayCambios || ocupado} title={!habilitada ? "La sección está deshabilitada" : hayCambios ? MSG_HAY_ESTRUCTURA : undefined} onClick={() => cambiarHijos(guardada, false)} className="text-[11px] font-bold text-primary hover:text-primary-dark disabled:opacity-40">Deshabilitar todos</button>
                                </div>
                              )}
                              {listas.filter(([lista]) => lista === "documentos" || s.tipo !== "archivos" || (s.archivosSeccion || []).length).map(([lista, titulo]) => {
                                const docs = (s[lista] || []).filter((d) => verRetirados || !retirado(d));
                                return (
                                  <div key={lista} className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-auto">{titulo}</p>
                                      {puedeEditar && !retirado(s) && <button type="button" disabled={hayPendientes} title={hayPendientes ? MSG_HAY_PENDIENTES : undefined} onClick={() => setModal({ tipo: "documento", seccion: s, lista })} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary-dark disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Agregar</button>}
                                    </div>
                                    {docs.length === 0 ? <p className="text-[11px] text-slate-400">Sin documentos.</p> : (
                                      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 bg-white">
                                        {docs.map((d) => {
                                          const g = guardada?.[lista]?.find((x) => x.clave === d.clave);
                                          const docHabilitado = g ? valor(NIVEL_LISTA[lista], guardada, g) : d.habilitado !== false;
                                          const pos = (s[lista] || []).findIndex((x) => x.clave === d.clave);
                                          const nivel = nivelDoc(s, lista);
                                          return (
                                            <li key={d.clave} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-[11px] ${docHabilitado && habilitada && !retirado(d) ? "" : "opacity-50"}`}>
                                              <Switch
                                                activo={docHabilitado} etiqueta={`Habilitar ${d.nombre}`}
                                                deshabilitado={!puedeEditar || !habilitada || !g || hayCambios || ocupado || retirado(d) || retirado(s)}
                                                titulo={!habilitada ? "La sección está deshabilitada" : hayCambios ? MSG_HAY_ESTRUCTURA : !g ? "Guarde el documento nuevo antes de habilitarlo." : undefined}
                                                onChange={(v) => cambiar([{ nivel: NIVEL_LISTA[lista], seccion: guardada, elemento: g, habilitado: v }])}
                                              />
                                              <span className="font-bold text-carbon-dark min-w-40">
                                                {d.nombre}
                                                {retirado(d) && <span className={`${CLASE_BADGE} ml-1 bg-slate-100 text-slate-500 border-slate-200`}>Retirado</span>}
                                                <span className="block text-[10px] font-mono font-normal text-slate-400">{s.clave}/{d.clave} · {ETIQUETA_NIVEL[nivel]}</span>
                                              </span>
                                              <Chips valores={d.alias} />
                                              {d.excluir?.length > 0 && <Chips valores={d.excluir.map((x) => `no: ${x}`)} clase="bg-red-50 text-red-700" />}
                                              <span className="flex flex-wrap items-center gap-2 text-slate-500">
                                                {d.obligatorio && <span>Obligatorio</span>}
                                                {d.multiple && <span>Múltiple</span>}
                                                {d.tipoDocumentalCodigo && <span className="inline-flex items-center gap-0.5 text-primary font-semibold"><Sparkles className="w-3 h-3" />{d.tipoDocumentalCodigo}</span>}
                                                {d.datosSensibles && <span className="inline-flex items-center gap-0.5 text-amber-700 font-semibold"><ShieldAlert className="w-3 h-3" />Sensible</span>}
                                              </span>
                                              <span className="ml-auto flex flex-wrap items-center gap-2">
                                                {requerimientosNodo({ nodoClave: `${s.clave}/${d.clave}`, nivel, guardado: Boolean(g), activo: Boolean(g) && !retirado(g) && activaGuardada, habilitado: docHabilitado && habilitada })}
                                                {puedeEditar && (
                                                  <>
                                                    <button type="button" disabled={hayPendientes || pos === 0} onClick={() => moverDocumento(s.clave, lista, d.clave, -1)} aria-label={`Subir ${d.nombre}`} className={BOTON_ICONO}><ArrowUp className="w-3.5 h-3.5" /></button>
                                                    <button type="button" disabled={hayPendientes || pos === (s[lista] || []).length - 1} onClick={() => moverDocumento(s.clave, lista, d.clave, 1)} aria-label={`Bajar ${d.nombre}`} className={BOTON_ICONO}><ArrowDown className="w-3.5 h-3.5" /></button>
                                                    {!retirado(d) && <button type="button" disabled={hayPendientes} onClick={() => setModal({ tipo: "documento", seccion: s, lista, documento: d })} aria-label={`Editar ${d.nombre}`} className={BOTON_ICONO}><Pencil className="w-3.5 h-3.5" /></button>}
                                                    {retirado(d)
                                                      ? <button type="button" disabled={hayPendientes || retirado(s)} onClick={() => estadoDocumento(s.clave, lista, d.clave, "activo")} aria-label={`Reactivar ${d.nombre}`} className={BOTON_ICONO}><RotateCcw className="w-3.5 h-3.5" /></button>
                                                      : <button type="button" disabled={hayPendientes} title="Retirar (no se borra)" onClick={() => setConfirmar({ retirarDocumento: { seccion: s, lista, documento: d } })} aria-label={`Retirar ${d.nombre}`} className="p-1 rounded text-slate-400 hover:text-red-600 disabled:opacity-40"><Archive className="w-3.5 h-3.5" /></button>}
                                                  </>
                                                )}
                                              </span>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    )}
                                  </div>
                                );
                              })}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {puedeEditar && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={hayPendientes} title={hayPendientes ? MSG_HAY_PENDIENTES : undefined} onClick={() => setModal({ tipo: "seccion" })} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-dark disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Agregar sección</button>
                <span className="ml-auto" />
                {hayCambios && <button type="button" onClick={() => aplicar(plantilla, null)} disabled={ocupado} className={CLASE_SECUNDARIO}>Descartar cambios</button>}
                <button type="button" onClick={() => ejecutar(() => plantillaEstructuraService.actualizar(plantilla.id, borrador), "Plantilla guardada (nueva versión).")} disabled={!hayCambios || ocupado} className={CLASE_PRIMARIO}>
                  {ocupado ? "Guardando..." : "Guardar cambios de estructura"}
                </button>
              </div>
            )}
          </Tarjeta>

          {puedeEditar && (
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
          )}
        </>
      )}

      {modal?.tipo === "seccion" && (
        <SeccionModal
          seccion={modal.seccion || null}
          clavesUsadas={borrador.secciones.map((s) => s.clave)}
          onCancelar={() => setModal(null)}
          onGuardar={(seccion) => {
            cambiarSecciones((secs) => (modal.seccion ? secs.map((s) => (s.clave === seccion.clave ? { ...seccion, habilitada: s.habilitada, estado: s.estado } : s)) : [...secs, seccion]));
            setModal(null);
          }}
        />
      )}
      {modal?.tipo === "documento" && (
        <DocumentoModal
          documento={modal.documento || null}
          clavesUsadas={[...(modal.seccion.archivosSeccion || []), ...(modal.seccion.documentos || [])].map((d) => d.clave)}
          tiposDocumentales={tipos}
          onCancelar={() => setModal(null)}
          onGuardar={(doc) => {
            guardarDocumento(modal.seccion.clave, modal.lista, modal.documento, doc);
            setModal(null);
          }}
        />
      )}
      {modal?.tipo === "sugeridos" && (
        <AliasSugeridosModal
          lista={sugerencias.filter((x) => x.nodoClave === modal.nodoClave)} puedeResolver={puedeEditar} ocupado={ocupado}
          onResolver={resolverSugerencia} onCerrar={() => setModal(null)}
        />
      )}
      {modal?.tipo === "duplicar" && (
        <DuplicarModal plantilla={plantilla} mandanteActual={mandanteId} onCerrar={() => setModal(null)}
          onDuplicada={(nombre) => { setModal(null); setAviso(`Plantilla duplicada en ${nombre} (versión 1, sin vínculos).`); }} />
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
          mensaje="Sin plantilla activa no se puede ubicar documentos de este Mandante. La plantilla se conserva."
          textoConfirmar="Desactivar"
          peligro
          ocupado={ocupado}
          onConfirmar={() => ejecutar(() => plantillaEstructuraService.desactivar(plantilla.id).then(() => null), "Plantilla desactivada.")}
          onCancelar={() => setConfirmar(null)}
        />
      )}
      {confirmar?.retirarSeccion && (
        <ConfirmacionModal
          titulo="Retirar la sección"
          mensaje={`${confirmar.retirarSeccion.nombre} y sus documentos quedarán retirados al guardar (no se borran; su clave queda reservada y sus vínculos con requerimientos quedan inactivos). Puede reactivarla con «Ver retirados».`}
          textoConfirmar="Retirar"
          peligro
          onConfirmar={() => { estadoSeccion(confirmar.retirarSeccion.clave, "retirado"); setConfirmar(null); }}
          onCancelar={() => setConfirmar(null)}
        />
      )}
      {confirmar?.retirarDocumento && (
        <ConfirmacionModal
          titulo="Retirar el documento"
          mensaje={`${confirmar.retirarDocumento.documento.nombre} quedará retirado al guardar (no se borra; sus vínculos quedan inactivos). Puede reactivarlo con «Ver retirados».`}
          textoConfirmar="Retirar"
          peligro
          onConfirmar={() => {
            const { seccion, lista, documento } = confirmar.retirarDocumento;
            estadoDocumento(seccion.clave, lista, documento.clave, "retirado");
            setConfirmar(null);
          }}
          onCancelar={() => setConfirmar(null)}
        />
      )}
    </div>
  );
};

// Alias sugeridos desde los expedientes para un nodo: el superadmin los aprueba (se agregan al nodo,
// en una versión nueva) o los rechaza.
const AliasSugeridosModal = ({ lista, puedeResolver, ocupado, onResolver, onCerrar }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onCerrar}>
    <div role="dialog" aria-modal="true" aria-label="Alias sugeridos" onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-dropdown w-full max-w-md p-5 space-y-3">
      <h3 className="text-sm font-bold text-carbon-dark">Alias sugeridos</h3>
      {lista.length === 0 ? <p className="text-xs text-slate-400">No hay sugerencias pendientes.</p> : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {lista.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="font-bold text-carbon-dark mr-auto">«{x.alias}»</span>
              <span className="text-[11px] text-slate-400">{x.sugeridoPor?.nombre || ""}</span>
              {puedeResolver && (
                <>
                  <button type="button" disabled={ocupado} onClick={() => onResolver(x, "aprobado")} className={`${CLASE_PRIMARIO} px-2.5 py-1 text-[11px]`}>Aprobar</button>
                  <button type="button" disabled={ocupado} onClick={() => onResolver(x, "rechazado")} className={`${CLASE_SECUNDARIO} px-2.5 py-1 text-[11px]`}>Rechazar</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end"><button type="button" onClick={onCerrar} className={CLASE_SECUNDARIO}>Cerrar</button></div>
    </div>
  </div>
);

// Duplicar la plantilla hacia otro Mandante (solo si no tiene plantilla activa): estructura, alias y
// tipo documental, sin vínculos ni versiones anteriores.
const DuplicarModal = ({ plantilla, mandanteActual, onCerrar, onDuplicada }) => {
  const [mandantes, setMandantes] = useState(null);
  const [destino, setDestino] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    let vigente = true;
    mandanteService.listar("activo")
      .then((l) => { if (vigente) setMandantes((l || []).filter((m) => m.id !== mandanteActual)); })
      .catch(() => { if (vigente) setMandantes([]); });
    return () => { vigente = false; };
  }, [mandanteActual]);
  const duplicar = async () => {
    setOcupado(true);
    setError(null);
    try {
      await plantillaEstructuraService.duplicar(plantilla.id, destino);
      onDuplicada(getMandanteDisplayName((mandantes || []).find((m) => m.id === destino)) || "el Mandante");
    } catch (err) {
      setError(err.message || "No se pudo duplicar la plantilla.");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label="Duplicar plantilla" onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-dropdown w-full max-w-md p-5 space-y-3">
        <h3 className="text-sm font-bold text-carbon-dark">Duplicar «{plantilla.nombre}»</h3>
        <p className="text-[11px] text-slate-500">Se copian la estructura, los alias y el tipo documental. No se copian los vínculos con requerimientos ni las versiones anteriores: el destino parte en la versión 1. El Mandante de destino no debe tener plantilla activa.</p>
        <select value={destino} onChange={(e) => setDestino(e.target.value)} aria-label="Mandante de destino"
          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs">
          <option value="">{mandantes === null ? "Cargando..." : "Elija el Mandante de destino"}</option>
          {(mandantes || []).map((m) => <option key={m.id} value={m.id}>{getMandanteDisplayName(m)}</option>)}
        </select>
        <ErrorBanner message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className={CLASE_SECUNDARIO}>Cancelar</button>
          <button type="button" disabled={!destino || ocupado} onClick={duplicar} className={CLASE_PRIMARIO}><Copy className="w-4 h-4" /> Duplicar</button>
        </div>
      </div>
    </div>
  );
};
