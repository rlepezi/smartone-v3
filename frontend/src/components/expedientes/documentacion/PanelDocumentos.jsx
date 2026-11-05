import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Eye, File, FileImage, FileText, Folder, FolderTree, KeyRound, Link2,
  Maximize2, Minimize2, Search, XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useCarpetaExpediente } from "../../../hooks/useCarpetaExpediente";
import { carpetaEsDe } from "../../../utils/carpetasSujetos";
import { ubicacionExpedienteService } from "../../../services/ubicacionExpedienteService";
import { carpetaDeEntidades, lectorCarpeta, resolverRequerimiento } from "../../../utils/resolverEnExpediente";
import { listarDirectorio, obtenerArchivo } from "../../../services/fuentes/carpetaLocal";
import { expedienteService } from "../../../services/expedienteService";
import { repositorioDocumentalService } from "../../../services/repositorioDocumentalService";
import { esImagen, esPdf, extensionDe, formatTamano } from "../../../utils/repositorioDocumental";
import { formatFecha } from "../../../utils/fechas";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO, MENSAJE_SIN_SOPORTE } from "./estilos";
import { SelectorCarpeta } from "./SelectorCarpeta";
import { ArbolCarpetas } from "./ArbolCarpetas";
import { VisorArchivo } from "./VisorArchivo";
import { EncabezadoRequerimiento, PestanaIA, ReglasApoyo, TituloPaso } from "./PanelRequerimientoIA";
import { Toast } from "../../shared/Toast";
import { AvisoFuenteLocal } from "../../shared/AvisoFuenteLocal";
import { usePanelDocumentos } from "./panelDocumentosContexto";

const IconoArchivo = ({ nombre }) => {
  const Icono = esPdf(nombre) ? FileText : esImagen(nombre) ? FileImage : File;
  return <Icono className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />;
};
const Mensaje = ({ children }) => <div className="p-4 text-xs text-slate-500 space-y-2">{children}</div>;
const BOTON_ICONO = "p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-carbon-dark disabled:opacity-30 disabled:hover:bg-transparent";
// Panel de documentos junto a la evaluación (Empresa, Personas, Recursos): SOLO previsualiza. Muestra
// la carpeta del contexto dentro del repositorio del expediente, sin subir de ella (E5: solo mapeo
// documental y patrones; la plantilla ya no se usa aquí):
//  - Ubicación de cada requerimiento: SOLO el Mapeo documental (nodos de la plantilla vinculados al
//    requerimiento): override confirmado en el expediente → alias del nodo; con varias posibles no
//    elige. Si no resuelve o es ambigua, superadmin y evaluador eligen la carpeta o el archivo y se
//    guarda un override; si el nombre real no está en los alias, "Sugerir como alias".
//  - Persona / Recurso: su carpetaRelativa (o "Asignar carpeta", que la guarda en su participación);
//    si no tiene, se busca por nombre dentro de la sección de entidades de la plantilla.
//  - Empresa: sin ubicación, la raíz de la carpeta del expediente.
// Lista ↔ visor: la lista conserva filtro y scroll; el visor navega ‹ › por la lista filtrada.
// La evaluación de la izquierda sigue usable mientras tanto. Acceso de solo lectura.
// Modo requerimiento (ícono de un requisito): pestañas [Evaluación manual] [Evaluación con IA]. La
// manual ubica la carpeta (o, sin carpeta resuelta, muestra solo el árbol para elegirla) y preselecciona
// el documento sin abrir la vista previa; la IA revisa ese mismo documento seleccionado.
export const PanelDocumentos = (props) => {
  const { expedienteId, usuarioId, repositorio, onRepositorio, empresa = null, mandanteId = null, origenCarpeta = null } = props;
  // Carpeta resuelta (resolverCarpetaExpediente): con Carpeta de empresa se abre desde la raíz de la
  // fuente autorizada en este navegador; legado, como antes (si este navegador no tiene la carpeta y
  // es la única de la empresa en la carpeta principal, se vincula sola sin cambiar la configuración
  // del expediente). Con `empresa`, solo se vincula una carpeta de esa Empresa.
  const usaFuente = origenCarpeta === "carpetaEmpresa";
  const carpeta = useCarpetaExpediente(usuarioId, expedienteId, {
    onRepositorio, empresa, mandanteId, usaFuente,
    rutaFuente: usaFuente && repositorio?.tipo === "local" ? repositorio.ruta : null,
    configurada: !usaFuente && repositorio?.tipo === "local" ? repositorio.etiqueta : null,
    autoVincular: !usaFuente && repositorio?.tipo === "local",
  });
  return (
    <>
      <ContenidoPanel {...props} carpeta={carpeta} />
      <Toast mensaje={carpeta.avisoAuto} onCerrar={carpeta.limpiarAvisoAuto} />
    </>
  );
};

const ContenidoPanel = ({
  expedienteId, repositorio, tipo, sujeto, carpetaSujeto = null, puedeEditar,
  onIrADocumentacion, onCarpetaAsignada, empresa = null, carpeta,
  proyecto = null, puedeDefinirReglas = false, origenCarpeta = null, puedeConfirmarUbicacion = false, mandanteId = null,
}) => {
  const {
    expandible, expandido, alternarExpandido, informarArchivo, archivoAbierto, requerimientoActivo, abrirRequerimiento,
    pestanaRequerimiento, cambiarPestanaRequerimiento,
  } = usePanelDocumentos();
  // Configuración del Mapeo documental para este expediente (nodos, aplicables y overrides).
  const [config, setConfig] = useState(null);
  const [versionConfig, setVersionConfig] = useState(0);
  useEffect(() => {
    let vigente = true;
    ubicacionExpedienteService.config(expedienteId)
      .then((c) => { if (vigente) setConfig(c); })
      .catch(() => { if (vigente) setConfig(null); });
    return () => { vigente = false; };
  }, [expedienteId, versionConfig]);
  const local = repositorio?.tipo === "local";
  // Resoluciones por clave (cada una se pide una vez; al confirmar se vuelven a pedir).
  const [resoluciones, setResoluciones] = useState({});
  const pedidas = useRef(new Set());
  const pedirResolucion = (clave, entrada) => {
    if (!clave || !config || !carpeta.lista || pedidas.current.has(clave)) return;
    pedidas.current.add(clave);
    const cache = new Map();
    resolverRequerimiento({ config, ...entrada, leer: lectorCarpeta(carpeta.handle, cache), cache })
      .then((r) => setResoluciones((x) => ({ ...x, [clave]: r })))
      .catch(() => setResoluciones((x) => ({ ...x, [clave]: { estado: "no_encontrada", archivos: [], candidatos: [] } })));
  };
  const [propuestaAlias, setPropuestaAlias] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const recargarUbicacion = () => {
    pedidas.current.clear();
    setResoluciones({});
    setVersionConfig((v) => v + 1);
  };

  // Empresa: requerimiento cuyo documento se busca (solo para ubicar su carpeta).
  const [requerimientos, setRequerimientos] = useState([]);
  const [requerimientoId, setRequerimientoId] = useState("");
  const [explorarRaiz, setExplorarRaiz] = useState(false);
  useEffect(() => {
    if (tipo !== "empresa") return undefined;
    let vigente = true;
    expedienteService.listarRequerimientos(expedienteId, { empresa: true, estado: "activo" })
      .then((lista) => { if (vigente) setRequerimientos(lista || []); })
      .catch(() => { if (vigente) setRequerimientos([]); });
    return () => { vigente = false; };
  }, [tipo, expedienteId]);
  // Empresa: ubicación del requerimiento en el Mapeo documental (sus nodos, sobre esta carpeta).
  const claveEmpresa = tipo === "empresa" && requerimientoId && config ? `e|${requerimientoId}|${versionConfig}` : null;
  const resolEmpresa = claveEmpresa ? resoluciones[claveEmpresa] || null : null;
  const resolviendo = Boolean(claveEmpresa) && !resolEmpresa;
  const padre = (r) => r.split("/").slice(0, -1).join("/");
  const archivosMapeados = resolEmpresa?.estado === "resuelta" ? resolEmpresa.archivos.map((a) => a.ruta) : [];
  const rutaRequerimiento = resolviendo ? null : archivosMapeados.length ? padre(archivosMapeados[0]) : null;

  // Persona / Recurso: si no tiene carpeta, o la asignada no es la suya (p. ej. la carpeta de todo el
  // personal), se busca por su nombre (o patente) entre las subcarpetas de la asignada, de la
  // carpeta del personal / maquinarias del mapeo o, sin ellas, de los dos primeros niveles. Con UNA
  // coincidencia se abre (y se asigna si puede editar); con ninguna o varias, se avisa.
  const claveSujeto = sujeto ? `${sujeto.id}|${carpetaSujeto || ""}` : null;
  const [busqueda, setBusqueda] = useState(null); // { clave, estado, ruta?, candidatos?, buscadoEn? }
  const busquedaActual = busqueda && busqueda.clave === claveSujeto ? busqueda : null;
  const rutaAuto = busquedaActual?.estado === "unica" ? busquedaActual.ruta : null;
  const carpetaDelSujeto = rutaAuto || carpetaSujeto;
  const esSuya = (rutaCarpeta) => Boolean(rutaCarpeta) && Boolean(sujeto) &&
    carpetaEsDe({ nombre: rutaCarpeta.split("/").pop() }, tipo, sujeto);

  // Carpeta de contexto: de ella no se sube. Empresa en modo requerimiento: la carpeta elegida a mano
  // o la resuelta por el mapeo; sin ninguna (null) se muestra solo el árbol para elegirla.
  const activo = requerimientoActivo;
  const idActivo = activo?.instancia.id || null;
  const reqActivoId = activo?.instancia.requerimientoId || null;
  const [carpetaManual, setCarpetaManual] = useState(null);
  const base = tipo !== "empresa" ? carpetaDelSujeto
    : activo ? (carpetaManual ?? (explorarRaiz ? null : rutaRequerimiento))
      : (explorarRaiz ? "" : rutaRequerimiento ?? "");
  const [ruta, setRuta] = useState(base);
  const [baseVista, setBaseVista] = useState(base);
  if (baseVista !== base) {
    setBaseVista(base);
    setRuta(base);
  }

  const [listado, setListado] = useState(null); // { carpetas, archivos } | "no_existe"
  const [rutaListada, setRutaListada] = useState(null); // ruta a la que corresponde `listado`
  // Documento seleccionado para el requerimiento activo (lo comparten las dos pestañas); `manual`
  // si lo eligió el usuario y no es el ubicado por el mapeo.
  const [seleccion, setSeleccion] = useState(null); // { ruta, manual }
  const [filtro, setFiltro] = useState("");
  const [visor, setVisor] = useState(null); // ruta del archivo abierto
  const [archivo, setArchivo] = useState(null);
  const [asignando, setAsignando] = useState(false);
  const [error, setError] = useState(null);
  const listaRef = useRef(null);
  const scrollGuardado = useRef(0);

  useEffect(() => {
    pedirResolucion(claveEmpresa, { requerimientoId, sujeto: "empresa" });
    // pedirResolucion depende de la clave (requerimiento y versión de la configuración).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveEmpresa, carpeta.lista]);

  useEffect(() => {
    if (!local || !carpeta.lista || ruta === null || ruta === undefined) return undefined;
    let vigente = true;
    const fijar = (l) => {
      if (!vigente) return;
      setListado(l);
      setRutaListada(ruta);
    };
    listarDirectorio(carpeta.handle, ruta)
      .then((l) => fijar(l || "no_existe"))
      .catch(() => fijar("no_existe"));
    return () => { vigente = false; };
  }, [local, carpeta.lista, carpeta.handle, ruta]);

  useEffect(() => {
    if (tipo === "empresa" || !sujeto || !local || !carpeta.lista || esSuya(carpetaSujeto)) return undefined;
    let vigente = true;
    const clave = claveSujeto;
    const subcarpetasSuyas = async (r) => ((await listarDirectorio(carpeta.handle, r).catch(() => null))?.carpetas || [])
      .filter((c) => carpetaEsDe(c, tipo, sujeto));
    (async () => {
      const cache = new Map();
      const entidades = config ? await carpetaDeEntidades({ config, entidad: tipo === "persona" ? "persona" : "maquinaria",
        leer: lectorCarpeta(carpeta.handle, cache), cache }) : null;
      const raizMapeo = entidades?.rutaReal || null;
      const raices = [...new Set([carpetaSujeto, raizMapeo].filter(Boolean))];
      for (const r of raices) {
        const encontradas = await subcarpetasSuyas(r);
        if (encontradas.length) return { candidatos: encontradas, buscadoEn: r };
      }
      if (raices.length) return { candidatos: [], buscadoEn: raices[0] };
      const primero = await listarDirectorio(carpeta.handle, "").catch(() => null);
      let candidatos = (primero?.carpetas || []).filter((c) => carpetaEsDe(c, tipo, sujeto));
      for (const c of primero?.carpetas || []) {
        if (candidatos.length) break;
        candidatos = await subcarpetasSuyas(c.ruta);
      }
      return { candidatos, buscadoEn: null };
    })().then(async ({ candidatos, buscadoEn }) => {
      if (!vigente) return;
      if (candidatos.length !== 1) {
        setBusqueda({ clave, estado: candidatos.length ? "varias" : "ninguna", candidatos, buscadoEn });
        return;
      }
      const [unica] = candidatos;
      setBusqueda({ clave, estado: "unica", ruta: unica.ruta, nombre: unica.nombre, guardada: false });
      if (!puedeEditar) return;
      try {
        await repositorioDocumentalService.asignarCarpetaSujeto(expedienteId, { tipo, sujetoId: sujeto.id, carpetaRelativa: unica.ruta });
        if (vigente) setBusqueda((b) => (b && b.clave === clave ? { ...b, guardada: true } : b));
        onCarpetaAsignada?.();
      } catch {
        // Se muestra igual (sin guardar); se puede asignar a mano.
      }
    });
    return () => { vigente = false; };
    // esSuya depende de sujeto/carpetaSujeto, ya en las dependencias; config, de su versión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, sujeto?.id, carpetaSujeto, local, carpeta.lista, carpeta.handle, repositorio, Boolean(config)]);

  // Archivo del visor (lectura perezosa; un PDF de 11 MB no bloquea la columna de requisitos).
  useEffect(() => {
    if (!visor || !carpeta.lista) return undefined;
    let vigente = true;
    obtenerArchivo(carpeta.handle, visor).then((f) => {
      if (!vigente) return;
      setArchivo(f);
      // Para "Revisar con IA" de la evaluación.
      informarArchivo(f ? { file: f, rutaRelativa: visor } : null);
    });
    return () => { vigente = false; };
  }, [visor, carpeta.lista, carpeta.handle, informarArchivo]);

  // Otro sujeto (el panel se vuelve a montar) o salir: ya no hay archivo abierto.
  useEffect(() => () => informarArchivo(null), [informarArchivo]);

  // Al volver a la lista se restaura la posición de scroll.
  useLayoutEffect(() => {
    if (!visor && listaRef.current) listaRef.current.scrollTop = scrollGuardado.current;
  }, [visor]);

  const texto = filtro.trim().toLowerCase();
  const enLista = listado && listado !== "no_existe" ? listado : { carpetas: [], archivos: [] };
  const subcarpetas = enLista.carpetas.filter((c) => !texto || c.nombre.toLowerCase().includes(texto));
  const archivos = enLista.archivos.filter((a) => !texto || a.nombre.toLowerCase().includes(texto));
  const indiceVisor = visor ? archivos.findIndex((a) => a.ruta === visor) : -1;

  const abrir = (a) => {
    scrollGuardado.current = listaRef.current?.scrollTop || 0;
    setArchivo(null);
    setVisor(a.ruta);
    if (activo) setSeleccion({ ruta: a.ruta, manual: !candidatos.some((c) => c.ruta === a.ruta) });
  };
  const mover = (delta) => {
    const siguiente = archivos[indiceVisor + delta];
    if (!siguiente) return;
    setArchivo(null);
    setVisor(siguiente.ruta);
    if (activo) setSeleccion({ ruta: siguiente.ruta, manual: !candidatos.some((c) => c.ruta === siguiente.ruta) });
  };

  const asignarCarpeta = async (nueva) => {
    setAsignando(false);
    setError(null);
    try {
      await repositorioDocumentalService.asignarCarpetaSujeto(expedienteId, { tipo, sujetoId: sujeto.id, carpetaRelativa: nueva });
      onCarpetaAsignada?.();
    } catch (err) {
      setError(err.message || "No se pudo asignar la carpeta.");
    }
  };
  // Override: la carpeta o el archivo real de un nodo en ESTE expediente. Si el nombre real no está
  // en los alias del nodo, se ofrece "Sugerir como alias".
  const confirmarUbicacion = async (nodoClave, sujetoClave, rutaReal) => {
    if (!nodoClave || !rutaReal) return;
    setError(null);
    setConfirmando(true);
    try {
      const r = await ubicacionExpedienteService.confirmarOverride(expedienteId, { nodoClave, sujeto: sujetoClave, rutaReal });
      setPropuestaAlias(r?.propuestaAlias || null);
      setExplorarRaiz(false);
      setCarpetaManual(null);
      recargarUbicacion();
    } catch (err) {
      setError(err.message || "No se pudo confirmar la ubicación.");
    } finally {
      setConfirmando(false);
    }
  };
  const sugerirAlias = async () => {
    const p = propuestaAlias;
    setPropuestaAlias(null);
    if (!p) return;
    try {
      const s = await ubicacionExpedienteService.sugerirAlias({ expedienteId, nodoClave: p.nodoClave, alias: p.alias });
      setAvisoAlias(s.estado === "aprobado" ? `Alias «${p.alias}» agregado a «${p.nodo}».` : `Alias «${p.alias}» sugerido: queda pendiente de aprobación del superadmin.`);
      recargarUbicacion();
    } catch (err) {
      setError(err.message || "No se pudo sugerir el alias.");
    }
  };
  const [avisoAlias, setAvisoAlias] = useState(null);
  const bloqueAlias = (propuestaAlias || avisoAlias) ? (
    <div className="p-2 rounded-lg bg-primary-lighter border border-primary/20 text-[11px] text-carbon-dark space-y-1.5">
      {propuestaAlias ? (
        <>
          <p>«<b>{propuestaAlias.alias}</b>» no está en los alias de «{propuestaAlias.nodo}». ¿Sugerirlo para que se encuentre solo en otros expedientes?</p>
          <div className="flex gap-1.5">
            <button type="button" onClick={sugerirAlias} className={CLASE_PRIMARIO}>Sugerir como alias</button>
            <button type="button" onClick={() => setPropuestaAlias(null)} className={CLASE_SECUNDARIO}>No</button>
          </div>
        </>
      ) : <p className="font-semibold text-sage-darker">{avisoAlias}</p>}
    </div>
  ) : null;

  // ── Modo requerimiento (ícono de un requisito de la planilla) ──
  // Ubica el documento: en Empresa, por los nodos del mapeo (override → alias); en Persona/Recurso, el
  // archivo del nodo de entidad dentro de su carpeta. Lo preselecciona SIN abrir la vista previa.
  // Checklist de reglas (ayuda en pantalla), si está desplegado (al abrir un requerimiento, siempre
  // desplegado) y el resultado ya marcado en la fila desde el panel ("cumple" | "no_cumple").
  const [checksReglas, setChecksReglas] = useState({});
  const [reglasAbiertas, setReglasAbiertas] = useState(true);
  const [marcado, setMarcado] = useState(null);
  const [activoVisto, setActivoVisto] = useState(null);
  const [resultadoVisto, setResultadoVisto] = useState(null);
  if (idActivo !== activoVisto) {
    setActivoVisto(idActivo);
    setResultadoVisto(activo?.resultadoFila ?? null);
    setChecksReglas({});
    setReglasAbiertas(true);
    setMarcado(null);
    setSeleccion(null);
    setCarpetaManual(null);
    setPropuestaAlias(null);
    setVisor(null);
    setArchivo(null);
    if (tipo === "empresa" && reqActivoId) {
      setRequerimientoId(reqActivoId);
      setExplorarRaiz(false);
    }
  }
  // Persona / Recurso: el documento del requerimiento activo en la carpeta del sujeto (nodos de
  // entidad del mapeo).
  const claveSujetoUbic = tipo !== "empresa" && sujeto && reqActivoId && carpetaDelSujeto && config
    ? `s|${reqActivoId}|${sujeto.id}|${carpetaDelSujeto}|${versionConfig}` : null;
  const resolSujeto = claveSujetoUbic ? resoluciones[claveSujetoUbic] || null : null;
  useEffect(() => {
    pedirResolucion(claveSujetoUbic, { requerimientoId: reqActivoId, sujeto: sujeto?.id, carpetaSujeto: carpetaDelSujeto });
    // Los datos están incluidos en la clave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveSujetoUbic, carpeta.lista]);
  const esperandoSujeto = Boolean(claveSujetoUbic) && !resolSujeto;

  const listoParaUbicar = Boolean(activo) && base !== null && Boolean(listado) && listado !== "no_existe" &&
    ruta === base && rutaListada === base && !resolviendo && !esperandoSujeto;
  // Empresa: los archivos ubicados por el mapeo. Persona/Recurso: los del nodo de entidad.
  const candidatos = !listoParaUbicar ? [] : tipo === "empresa"
    ? enLista.archivos.filter((a) => archivosMapeados.includes(a.ruta))
    : (resolSujeto?.estado === "resuelta" ? resolSujeto.archivos : []);
  // Si el SI/NO/N/A de la fila cambia a algo distinto de lo marcado desde el panel (se deselecciona,
  // o se elige NO o N/A), el checklist y el aviso "Marcado..." se limpian. Un SI elegido en la fila
  // sin haber marcado desde aquí no los toca.
  const resultadoFila = activo?.resultadoFila ?? null;
  if (activoVisto === idActivo && resultadoFila !== resultadoVisto) {
    setResultadoVisto(resultadoFila);
    if (resultadoFila !== marcado && !(marcado === null && resultadoFila === "cumple")) {
      setChecksReglas({});
      setMarcado(null);
    }
  }

  // Sin documento elegido, se preselecciona el ubicado por el mapeo (también al volver a abrir el
  // mismo requerimiento).
  if (listoParaUbicar && !seleccion && candidatos[0]) setSeleccion({ ruta: candidatos[0].ruta, manual: false });
  // "Ir al Mapeo documental": solo superadmin (los demás ven el aviso sin enlace).
  const enlaceMapeo = puedeDefinirReglas
    ? <>{" "}<Link to="/configuracion/ia?tab=mapeo" className="font-bold text-primary hover:underline">Ir al Mapeo documental</Link></>
    : null;
  // Empresa: dónde está el documento del requerimiento (ubicación en el mapeo documental, la carpeta
  // elegida a mano y el override de este expediente).
  const nodoEmpresa = resolEmpresa?.nodoClave || null;
  const resueltaEmpresa = resolEmpresa?.estado === "resuelta";
  const confirmableEmpresa = !puedeConfirmarUbicacion || !nodoEmpresa ? null
    : activo ? (seleccion?.manual ? { ruta: seleccion.ruta, archivo: true }
      : base !== null && ruta && ruta !== rutaRequerimiento ? { ruta, archivo: false } : null)
      : base === "" && ruta && ruta !== rutaRequerimiento ? { ruta: visor || ruta, archivo: Boolean(visor) } : null;
  const controlesCarpetaEmpresa = tipo === "empresa" && requerimientoId ? (
    <>
      {resolviendo && <p className="text-[11px] text-slate-400">Buscando la ubicación en el mapeo documental...</p>}
      {resueltaEmpresa && !explorarRaiz && carpetaManual === null && (
        <div className="text-[11px] text-slate-500 space-y-0.5">
          <p>{resolEmpresa.origen === "override" ? "Ubicación confirmada en este expediente" : "Ubicación por el mapeo documental"}:{" "}
            <button type="button" onClick={() => setExplorarRaiz(true)} className="font-bold text-primary hover:underline">{activo ? "Elegir otra carpeta" : "Explorar la carpeta"}</button>
          </p>
          {resolEmpresa.resultados.filter((x) => x.r.estado === "resuelta").map((x) => (
            <p key={x.nodo.nodoClave} className="flex items-center gap-1 text-carbon-dark min-w-0" title={x.r.rutaReal}>
              <Folder className="w-3 h-3 shrink-0 text-primary" /><b className="truncate">{x.r.rutaReal}</b>
              <span className="text-slate-400 truncate">· {x.nodo.ruta}</span>
            </p>
          ))}
        </div>
      )}
      {resolEmpresa?.estado === "sugerida" && (
        <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 space-y-1.5">
          <p>Hay varias ubicaciones posibles. {puedeConfirmarUbicacion ? "Confirme la correcta:" : "Un evaluador debe confirmar la correcta."}</p>
          {puedeConfirmarUbicacion && (
            <div className="flex flex-wrap gap-1.5">
              {resolEmpresa.candidatos.map((c) => (
                <button key={c} type="button" disabled={confirmando} onClick={() => confirmarUbicacion(nodoEmpresa, "empresa", c)} className={CLASE_SECUNDARIO}>{c.split("/").pop()}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {resolEmpresa?.estado === "no_encontrada" && !explorarRaiz && carpetaManual === null && (
        <p className="text-[11px] text-amber-700">
          No se encontró en la carpeta del expediente por los alias del mapeo.{activo ? " Elija la carpeta en el árbol." : puedeConfirmarUbicacion ? " Abra la carpeta correcta y confírmela." : ""}
        </p>
      )}
      {resolEmpresa?.estado === "sin_mapeo" && (
        <p className="text-[11px] text-amber-700">Sin ubicación en el mapeo documental.{enlaceMapeo}</p>
      )}
      {activo && carpetaManual !== null && (
        <p className="text-[11px] text-slate-500 min-w-0">
          Carpeta elegida: <b className="text-carbon-dark">{carpetaManual || carpeta.handle?.name}</b>{" "}
          <button type="button" onClick={() => { setCarpetaManual(null); setExplorarRaiz(true); }} className="font-bold text-primary hover:underline">Elegir otra</button>
          {resueltaEmpresa && (
            <>{" · "}<button type="button" onClick={() => { setCarpetaManual(null); setExplorarRaiz(false); }} className="font-bold text-primary hover:underline">Volver a la del mapeo</button></>
          )}
        </p>
      )}
      {confirmableEmpresa && (
        <button type="button" disabled={confirmando} onClick={() => confirmarUbicacion(nodoEmpresa, "empresa", confirmableEmpresa.ruta)} className={CLASE_SECUNDARIO}>
          <FolderTree className="w-3.5 h-3.5" /> {confirmableEmpresa.archivo ? "Confirmar este archivo para el requerimiento" : "Confirmar esta carpeta para el requerimiento"}
        </button>
      )}
      {!activo && puedeConfirmarUbicacion && nodoEmpresa && base === "" && !ruta && !resueltaEmpresa && (
        <p className="text-[11px] text-slate-500">Abra la carpeta donde está el documento y presione «Confirmar esta carpeta para el requerimiento» (queda como excepción de este expediente).</p>
      )}
      {bloqueAlias}
    </>
  ) : null;
  // Persona / Recurso: confirmar el archivo elegido como documento del requerimiento (override).
  const nodoSujeto = resolSujeto?.nodoClave || null;
  const controlesSujeto = tipo !== "empresa" && activo && sujeto ? (
    <>
      {carpetaDelSujeto && (
        <p className="flex items-center gap-1 text-[11px] text-slate-500 min-w-0" title={carpetaDelSujeto}>
          <Folder className="w-3 h-3 shrink-0 text-primary" /> Carpeta: <b className="truncate text-carbon-dark">{carpetaDelSujeto.split("/").pop()}</b>
        </p>
      )}
      {esperandoSujeto && <p className="text-[11px] text-slate-400">Buscando el documento por el mapeo documental...</p>}
      {resolSujeto?.estado === "resuelta" && <p className="text-[11px] text-sage-darker">Documento ubicado por el mapeo documental.</p>}
      {resolSujeto?.estado === "no_encontrada" && (
        <p className="text-[11px] text-amber-700">No se encontró el documento por los alias del mapeo: elíjalo en la lista.</p>
      )}
      {resolSujeto?.estado === "sin_mapeo" && (
        <p className="text-[11px] text-amber-700">Sin ubicación en el mapeo documental.{enlaceMapeo}</p>
      )}
      {resolSujeto?.estado === "sugerida" && <p className="text-[11px] text-amber-700">Varios archivos posibles: elija el correcto.</p>}
      {puedeConfirmarUbicacion && nodoSujeto && seleccion?.manual && (
        <button type="button" disabled={confirmando} onClick={() => confirmarUbicacion(nodoSujeto, sujeto.id, seleccion.ruta)} className={CLASE_SECUNDARIO}>
          <FolderTree className="w-3.5 h-3.5" /> Confirmar este documento para el requerimiento
        </button>
      )}
      {bloqueAlias}
    </>
  ) : null;

  // Documento que leerá la IA: el seleccionado en la pestaña manual.
  const nombreSeleccion = seleccion ? seleccion.ruta.split("/").pop() : null;
  const documentoIA = seleccion ? {
    ruta: seleccion.ruta,
    nombre: nombreSeleccion,
    leer: async () => (archivoAbierto?.rutaRelativa === seleccion.ruta ? archivoAbierto.file
      : obtenerArchivo(carpeta.handle, seleccion.ruta)),
  } : null;
  // Sin documento (búsqueda terminada y nada seleccionado): reglas a la vista y opción "No cumple".
  const sinDocumento = Boolean(activo) && !seleccion && !resolviendo && !esperandoSujeto && (base === null || listoParaUbicar);
  const NO_ENCONTRADO = "Documento no encontrado en la carpeta del expediente.";
  // Resultado marcado desde el panel (llena la fila; se guarda con "Guardar Evaluación"). Cumple: todas
  // las reglas verificadas. No cumple: las reglas que faltan (y si no hay documento, se dice).
  const marcar = (resultado, faltantes = []) => {
    const nombres = (lista) => lista.map((r) => r.nombre).join(", ");
    const observaciones = resultado === "cumple"
      ? `Verificado manualmente: ${nombres(activo.pauta?.reglas || [])}.`
      : [sinDocumento ? NO_ENCONTRADO : null, faltantes.length ? `No verificado: ${nombres(faltantes)}.` : null].filter(Boolean).join(" ");
    activo.acciones.current.marcarResultado?.({ resultado, observaciones: observaciones || NO_ENCONTRADO });
    setMarcado(resultado);
  };
  const hayReglas = (activo?.pauta?.reglas || []).length > 0;
  // La pestaña IA solo se abre con reglas definidas: sin reglas se ve la manual (aunque la última
  // elegida haya sido la IA en otro requerimiento).
  const pestanaVisible = hayReglas ? pestanaRequerimiento : "manual";
  const conEncabezado = (contenido) => {
    if (!activo) return contenido;
    return (
      <div className="flex flex-col h-full min-h-0">
        <EncabezadoRequerimiento instancia={activo.instancia} pauta={activo.pauta} pestana={pestanaVisible}
          onPestana={cambiarPestanaRequerimiento} onCerrar={() => abrirRequerimiento?.(null)} />
        {pestanaVisible === "ia" ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <PestanaIA key={idActivo} datos={activo} expedienteId={expedienteId} documento={documentoIA}
              ctx={{ tipoEntidad: tipo, sujeto, empresa, proyecto }} onIrAManual={() => cambiarPestanaRequerimiento("manual")} />
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="p-3 space-y-1.5 border-b border-slate-100 max-h-[35%] overflow-y-auto">
              <TituloPaso>Ubicar el documento</TituloPaso>
              {tipo === "empresa" ? controlesCarpetaEmpresa : controlesSujeto}
              {/* Sin documento (no encontrado o sin elegir) no hay nada que validar: "No cumple" aquí,
                  junto al aviso, con o sin reglas. */}
              {sinDocumento && activo.puedeRevisar && (
                marcado === "no_cumple" ? (
                  <p className="text-[11px] font-bold text-sage-darker">Marcado «No cumple» en la fila: revíselo y presione «Guardar Evaluación».</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-red-50/60 border border-red-100">
                    <span className="text-[11px] text-red-800">¿El documento no existe?</span>
                    <button type="button" onClick={() => marcar("no_cumple")}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border border-red-200 bg-white text-[11px] font-bold text-red-700 hover:bg-red-50">
                      <XCircle className="w-3.5 h-3.5" /> Marcar como No cumple
                    </button>
                  </div>
                )
              )}
            </div>
            {/* El checklist marca Cumple / No cumple solo con un documento elegido. */}
            <ReglasApoyo reglas={activo.pauta?.reglas} ctx={{ tipoEntidad: tipo, sujeto, empresa, proyecto }}
              abierto={reglasAbiertas} onAlternar={() => setReglasAbiertas((v) => !v)}
              checks={checksReglas} onCheck={(id, v) => { setChecksReglas((c) => ({ ...c, [id]: v })); setMarcado(null); }}
              onMarcar={activo.puedeRevisar && !sinDocumento ? marcar : null} marcado={marcado} />
            <div className="px-3 pt-2 pb-1 space-y-1">
              <TituloPaso>Abrir el documento</TituloPaso>
              <p className="text-[11px] text-slate-500 truncate" title={seleccion?.ruta}>
                {seleccion ? <>Seleccionado: <b className="text-carbon-dark">{nombreSeleccion}</b></> : "Ningún documento seleccionado."}
              </p>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">{contenido}</div>
          </div>
        )}
      </div>
    );
  };

  const nombreSujeto = sujeto ? (`${sujeto.nombre || ""} ${sujeto.apellido || ""}`.trim() || sujeto.patente || "este recurso") : "";
  const avisoBusqueda = !busquedaActual ? null : busquedaActual.estado === "unica" ? (
    <p className="text-[11px] text-sage-darker font-semibold">
      Carpeta encontrada por {tipo === "persona" ? "nombre" : "patente o nombre"}: «{busquedaActual.nombre}»{busquedaActual.guardada ? " (asignada a la persona)" : ""}.
    </p>
  ) : busquedaActual.estado === "ninguna" ? (
    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 space-y-1.5">
      <p>No se encontró una carpeta con el {tipo === "persona" ? "nombre" : "nombre o la patente"} de <b>{nombreSujeto}</b>{busquedaActual.buscadoEn ? <> en «{busquedaActual.buscadoEn}»</> : " en la carpeta del expediente"}.</p>
      {puedeEditar && <button type="button" onClick={() => setAsignando(true)} className={CLASE_SECUNDARIO}><FolderTree className="w-3.5 h-3.5" /> Asignar carpeta manualmente</button>}
    </div>
  ) : (
    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 space-y-1.5">
      <p>Hay {busquedaActual.candidatos.length} carpetas que podrían ser de <b>{nombreSujeto}</b>. Elija la correcta:</p>
      <div className="flex flex-wrap gap-1.5">
        {busquedaActual.candidatos.map((c) => (
          <button key={c.ruta} type="button" disabled={!puedeEditar} onClick={() => asignarCarpeta(c.ruta)} className={CLASE_SECUNDARIO}>{c.nombre}</button>
        ))}
      </div>
    </div>
  );

  // ── Estados sin listado ──
  if (!repositorio) {
    return conEncabezado(
      <Mensaje>
        <p>Este expediente aún no tiene configurada la ubicación de su documentación.</p>
        <button type="button" onClick={onIrADocumentacion} className="font-bold text-primary hover:underline">Configurar en la pestaña Documentación</button>
      </Mensaje>
    );
  }
  if (repositorio.tipo === "sharepoint") {
    return conEncabezado(
      <Mensaje>
        <p>La documentación está en SharePoint: <b>{repositorio.etiqueta}</b>.</p>
        <a href={repositorio.url} target="_blank" rel="noopener noreferrer" className={CLASE_SECUNDARIO}><ExternalLink className="w-3.5 h-3.5" /> Abrir carpeta en SharePoint</a>
        <p className="text-[11px] text-slate-400">La vista previa integrada de SharePoint estará disponible en una próxima fase.</p>
      </Mensaje>
    );
  }
  if (!carpeta.soportado) return conEncabezado(<Mensaje><p>{MENSAJE_SIN_SOPORTE}</p></Mensaje>);
  if (carpeta.cargando) return conEncabezado(<Mensaje><p>Cargando carpeta...</p></Mensaje>);
  // Carpeta de empresa: se abre desde la raíz de la fuente autorizada en este navegador.
  if (origenCarpeta === "carpetaEmpresa" && !carpeta.handle) {
    return conEncabezado(
      <Mensaje>
        {carpeta.faltaRaiz ? (
          <AvisoFuenteLocal mandanteId={mandanteId}>
            <button type="button" onClick={onIrADocumentacion} className="font-bold text-primary hover:underline">Autorizarla en la pestaña Documentación</button>
          </AvisoFuenteLocal>
        ) : carpeta.permiso === "prompt" ? (
          <>
            <p>El navegador necesita que confirme el acceso a la fuente documental para abrir «{repositorio.ruta}».</p>
            <button type="button" onClick={carpeta.reautorizar} className={CLASE_PRIMARIO}><KeyRound className="w-4 h-4" /> Re-autorizar</button>
          </>
        ) : <p>No se pudo abrir la carpeta «{repositorio.ruta}».</p>}
        {carpeta.error && <p className="text-red-600">{carpeta.error}</p>}
      </Mensaje>
    );
  }
  if (!carpeta.handle) {
    return conEncabezado(
      <Mensaje>
        <p>La carpeta «{repositorio.etiqueta}» no está vinculada en este equipo.</p>
        <button type="button" onClick={carpeta.vincular} className={CLASE_PRIMARIO}><Link2 className="w-4 h-4" /> Vincular carpeta</button>
        {carpeta.rechazada && (
          <p className="text-amber-700">La carpeta «{carpeta.rechazada}» no contiene el nombre de la empresa {empresa?.razonSocial}. Elige la carpeta correcta.</p>
        )}
        {carpeta.error && <p className="text-red-600">{carpeta.error}</p>}
      </Mensaje>
    );
  }
  if (carpeta.permiso !== "granted") {
    return conEncabezado(
      <Mensaje>
        <p>El navegador necesita que confirme el acceso a «{carpeta.handle.name}».</p>
        <button type="button" onClick={carpeta.reautorizar} className={CLASE_PRIMARIO}><KeyRound className="w-4 h-4" /> Re-autorizar</button>
        {carpeta.error && <p className="text-red-600">{carpeta.error}</p>}
      </Mensaje>
    );
  }

  const selectorAsignar = asignando && (
    <SelectorCarpeta
      handle={carpeta.handle}
      tipo={tipo === "empresa" ? null : tipo}
      rutaInicial={busquedaActual?.buscadoEn || ""}
      titulo={`Carpeta de ${sujeto ? (`${sujeto.nombre || ""} ${sujeto.apellido || ""}`.trim() || "este recurso") : "este recurso"}`}
      onElegir={asignarCarpeta}
      onCerrar={() => setAsignando(false)}
    />
  );

  if (tipo !== "empresa") {
    if (!sujeto) return conEncabezado(<Mensaje><p>{tipo === "persona" ? "Selecciona una persona para ver sus documentos" : "Selecciona un recurso para ver sus documentos"}</p></Mensaje>);
    if (!carpetaDelSujeto) {
      return conEncabezado(
        <Mensaje>
          {!busquedaActual && carpeta.lista
            ? <p>Buscando la carpeta de {tipo === "persona" ? "la persona" : "la maquinaria"} por su {tipo === "persona" ? "nombre" : "patente o nombre"}...</p>
            : <p>{tipo === "persona" ? "Esta persona" : "Este recurso"} aún no tiene carpeta asignada.</p>}
          {avisoBusqueda}
          {puedeEditar && <button type="button" onClick={() => setAsignando(true)} className={CLASE_PRIMARIO}><FolderTree className="w-4 h-4" /> Asignar carpeta</button>}
          {error && <p className="text-red-600">{error}</p>}
          {selectorAsignar}
        </Mensaje>
      );
    }
  }
  // Empresa en modo requerimiento sin carpeta resuelta: solo el árbol para elegirla (la lista de
  // archivos y el filtro aparecen recién cuando se elige una).
  if (tipo === "empresa" && activo && base === null) {
    return conEncabezado(resolviendo
      ? <Mensaje><p>Buscando la ubicación en el mapeo documental...</p></Mensaje>
      : <ArbolCarpetas handle={carpeta.handle} onElegir={(r) => { setCarpetaManual(r); setExplorarRaiz(false); }} />);
  }
  if (listado === "no_existe" && ruta === base) {
    return conEncabezado(
      <Mensaje>
        <p>No se encontró la carpeta <b className="text-carbon-dark">{base || carpeta.handle.name}</b>.</p>
        {tipo === "empresa" ? (
          <button type="button" onClick={() => setExplorarRaiz(true)} className={CLASE_SECUNDARIO}>Elegir otra carpeta</button>
        ) : puedeEditar && <button type="button" onClick={() => setAsignando(true)} className={CLASE_SECUNDARIO}>Reasignar carpeta</button>}
        {error && <p className="text-red-600">{error}</p>}
        {selectorAsignar}
      </Mensaje>
    );
  }

  // ── Vista visor ──
  if (visor) {
    const nombre = visor.split("/").pop();
    return conEncabezado(
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-100 bg-slate-50">
          <button type="button" onClick={() => { setVisor(null); informarArchivo(null); }} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-primary hover:bg-primary-lighter">
            <ArrowLeft className="w-3.5 h-3.5" /> Archivos
          </button>
          <span className="flex-1 min-w-0 truncate text-[11px] font-semibold text-carbon-dark" title={nombre}>{nombre}</span>
          <button type="button" onClick={() => mover(-1)} disabled={indiceVisor <= 0} aria-label="Archivo anterior" className={BOTON_ICONO}><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-[10px] text-slate-400 tabular-nums">{indiceVisor + 1}/{archivos.length}</span>
          <button type="button" onClick={() => mover(1)} disabled={indiceVisor < 0 || indiceVisor >= archivos.length - 1} aria-label="Archivo siguiente" className={BOTON_ICONO}><ChevronRight className="w-4 h-4" /></button>
          {expandible && (
            <button type="button" onClick={alternarExpandido} aria-pressed={expandido} title={expandido ? "Restaurar tamaño" : "Expandir"}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-100">
              {expandido ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />} {expandido ? "Restaurar" : "Expandir"}
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          {!archivo ? (
            <p className="m-auto flex items-center gap-2 text-xs text-slate-500">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-hidden="true" /> Leyendo archivo...
            </p>
          ) : (
            <VisorArchivo archivo={archivo} mostrarNombre={false} />
          )}
        </div>
      </div>
    );
  }

  // ── Vista lista ──
  const relativa = ruta && ruta.startsWith(base || "") ? ruta.slice((base || "").length).split("/").filter(Boolean) : [];
  return conEncabezado(
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-slate-100 space-y-2">
        {tipo === "empresa" && !activo && (
          <label className="block text-[11px] text-slate-500">
            Requerimiento (para abrir su carpeta)
            <select value={requerimientoId} onChange={(e) => { setRequerimientoId(e.target.value); setExplorarRaiz(false); }}
              className="mt-0.5 w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-carbon-dark">
              <option value="">Toda la carpeta de la empresa</option>
              {requerimientos.map((r) => (
                <option key={r.id} value={r.requerimientoId}>{r.nombreCorto || r.nombre}{config?.aplicables?.[r.requerimientoId] ? " · 📁" : ""}</option>
              ))}
            </select>
          </label>
        )}
        {!activo && controlesCarpetaEmpresa}
        {tipo !== "empresa" && avisoBusqueda}
        <nav className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500" aria-label="Ruta">
          {relativa.length > 0 && (
            <button type="button" onClick={() => setRuta(ruta.split("/").slice(0, -1).join("/"))} aria-label="Subir" className="p-0.5 rounded hover:bg-slate-100"><ArrowLeft className="w-3.5 h-3.5" /></button>
          )}
          <button type="button" onClick={() => setRuta(base)} className="font-bold text-carbon-dark hover:underline truncate max-w-[14rem]" title={base || carpeta.handle.name}>
            {base ? base.split("/").pop() : carpeta.handle.name}
          </button>
          {relativa.map((parte, i) => (
            <span key={`${parte}-${i}`} className="flex items-center gap-1"><ChevronRight className="w-3 h-3" />
              <button type="button" onClick={() => setRuta([base, ...relativa.slice(0, i + 1)].filter(Boolean).join("/"))} className="hover:underline">{parte}</button>
            </span>
          ))}
        </nav>
        <label className="relative block">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar archivos" aria-label="Filtrar archivos"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </label>
        {error && <p className="text-[11px] text-red-600">{error}</p>}
      </div>

      <ul ref={listaRef} className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
        {!listado && <li className="p-3 text-xs text-slate-400">Leyendo...</li>}
        {listado === "no_existe" && <li className="p-3 text-xs text-slate-400">Esta carpeta ya no existe.</li>}
        {listado && listado !== "no_existe" && !subcarpetas.length && !archivos.length && (
          <li className="p-3 text-xs text-slate-400">{texto ? "Ningún archivo coincide con el filtro." : "La carpeta está vacía."}</li>
        )}
        {subcarpetas.map((c) => (
          <li key={c.ruta}>
            <button type="button" onClick={() => setRuta(c.ruta)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-carbon-dark hover:bg-slate-50">
              <Folder className="w-4 h-4 text-primary" /> <span className="truncate">{c.nombre}</span>
            </button>
          </li>
        ))}
        {archivos.map((a) => {
          const elegido = Boolean(activo) && seleccion?.ruta === a.ruta;
          return (
          <li key={a.ruta}>
            <button type="button" onClick={() => abrir(a)} title={`Ver ${a.nombre}`} aria-current={elegido || undefined}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-primary-lighter/50 ${elegido ? "bg-primary-lighter/40" : ""}`}>
              <IconoArchivo nombre={a.nombre} />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-xs font-semibold text-carbon-dark">{a.nombre}</span>
                <span className="block text-[10px] text-slate-400">{(extensionDe(a.nombre) || "archivo").toUpperCase()} · {formatTamano(a.tamanoBytes)} · {formatFecha(a.ultimaModificacion)}</span>
                {activo && (elegido || candidatos.some((c) => c.ruta === a.ruta)) && (
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {elegido && <span className="px-1.5 py-px rounded-full bg-primary text-white text-[10px] font-bold">Seleccionado</span>}
                    {candidatos.some((c) => c.ruta === a.ruta) && (
                      <span className="px-1.5 py-px rounded-full bg-primary-lighter text-primary text-[10px] font-bold">Ubicado por el mapeo</span>
                    )}
                  </span>
                )}
              </span>
              <Eye className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
            </button>
          </li>
          );
        })}
      </ul>
      {selectorAsignar}
    </div>
  );
};
