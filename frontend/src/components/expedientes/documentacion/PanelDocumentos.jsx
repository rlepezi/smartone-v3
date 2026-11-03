import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Eye, File, FileImage, FileText, Folder, FolderTree, KeyRound, Link2,
  Maximize2, Minimize2, Search,
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
import { VisorArchivo } from "./VisorArchivo";
import { PanelRequerimientoIA } from "./PanelRequerimientoIA";
import { Toast } from "../../shared/Toast";
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
  proyecto = null, puedeDefinirReglas = false, origenCarpeta = null, puedeConfirmarUbicacion = false,
}) => {
  const {
    expandible, expandido, alternarExpandido, informarArchivo, archivoAbierto, requerimientoActivo, abrirRequerimiento,
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

  // Carpeta de contexto: de ella no se sube.
  const base = tipo === "empresa" ? (explorarRaiz ? "" : rutaRequerimiento ?? "") : carpetaDelSujeto;
  const [ruta, setRuta] = useState(base);
  const [baseVista, setBaseVista] = useState(base);
  if (baseVista !== base) {
    setBaseVista(base);
    setRuta(base);
  }

  const [listado, setListado] = useState(null); // { carpetas, archivos } | "no_existe"
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
    listarDirectorio(carpeta.handle, ruta)
      .then((l) => { if (vigente) setListado(l || "no_existe"); })
      .catch(() => { if (vigente) setListado("no_existe"); });
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
  };
  const mover = (delta) => {
    const siguiente = archivos[indiceVisor + delta];
    if (siguiente) { setArchivo(null); setVisor(siguiente.ruta); }
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

  // ── Modo requerimiento (ícono IA de un requisito de la planilla) ──
  // Ubica el documento: en Empresa, por el mapeo (sus archivos mapeados o los de su carpeta); en
  // Persona/Recurso, el archivo de su carpeta que coincide con un patrón aprendido. Abre el primero;
  // si no hay, deja la lista para elegir.
  const activo = requerimientoActivo;
  const idActivo = activo?.instancia.id || null;
  const reqActivoId = activo?.instancia.requerimientoId || null;
  const [activoVisto, setActivoVisto] = useState(null);
  if (idActivo !== activoVisto) {
    setActivoVisto(idActivo);
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

  const listoParaUbicar = Boolean(activo) && Boolean(listado) && listado !== "no_existe" && ruta === base && !resolviendo && !esperandoSujeto;
  // Empresa: los archivos ubicados por el mapeo. Persona/Recurso: los del nodo de entidad.
  const candidatos = !listoParaUbicar ? [] : tipo === "empresa"
    ? enLista.archivos.filter((a) => archivosMapeados.includes(a.ruta))
    : (resolSujeto?.estado === "resuelta" ? resolSujeto.archivos : []);
  const claveUbicacion = listoParaUbicar ? `${idActivo}|${base}` : null;
  const [ubicacionHecha, setUbicacionHecha] = useState(null);
  if (claveUbicacion && claveUbicacion !== ubicacionHecha) {
    setUbicacionHecha(claveUbicacion);
    setArchivo(null);
    setVisor(candidatos[0]?.ruta || null);
  }
  // Empresa: dónde está el documento del requerimiento (ubicación en el mapeo documental o "Asociar
  // esta carpeta"). En modo requerimiento se muestran en el encabezado, entre el requerimiento y sus
  // reglas (el flujo: qué requisito → dónde está → qué revisar).
  const nodoEmpresa = resolEmpresa?.nodoClave || null;
  const controlesCarpetaEmpresa = tipo === "empresa" && requerimientoId ? (
    <>
      {resolviendo && <p className="text-[11px] text-slate-400">Buscando la ubicación en el mapeo documental...</p>}
      {resolEmpresa?.estado === "resuelta" && !explorarRaiz && (
        <div className="text-[11px] text-slate-500 space-y-0.5">
          <p>{resolEmpresa.origen === "override" ? "Ubicación confirmada en este expediente" : "Ubicación por el mapeo documental"}:{" "}
            <button type="button" onClick={() => setExplorarRaiz(true)} className="font-bold text-primary hover:underline">Explorar la carpeta</button>
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
      {resolEmpresa?.estado === "no_encontrada" && !explorarRaiz && (
        <p className="text-[11px] text-amber-700">
          No se encontró en esta carpeta por los alias del mapeo.{puedeConfirmarUbicacion ? " Abra la carpeta correcta y confírmela." : ""}
        </p>
      )}
      {resolEmpresa?.estado === "sin_mapeo" && (
        <p className="text-[11px] text-amber-700">
          Sin ubicación en el mapeo documental (o no aplica al perfil de este expediente).{" "}
          <Link to="/configuracion/ia?tab=mapeo" className="font-bold text-primary hover:underline">Ir al Mapeo documental</Link>
        </p>
      )}
      {puedeConfirmarUbicacion && nodoEmpresa && base === "" && ruta && ruta !== rutaRequerimiento && (
        <button type="button" disabled={confirmando} onClick={() => confirmarUbicacion(nodoEmpresa, "empresa", visor || ruta)} className={CLASE_SECUNDARIO}>
          <FolderTree className="w-3.5 h-3.5" /> {visor ? "Confirmar este archivo para el requerimiento" : "Confirmar esta carpeta para el requerimiento"}
        </button>
      )}
      {puedeConfirmarUbicacion && nodoEmpresa && base === "" && !ruta && resolEmpresa?.estado !== "resuelta" && (
        <p className="text-[11px] text-slate-500">Abra la carpeta donde está el documento y presione «Confirmar esta carpeta para el requerimiento» (queda como excepción de este expediente).</p>
      )}
      {bloqueAlias}
    </>
  ) : null;
  // Persona / Recurso: confirmar el archivo abierto como documento del requerimiento (override).
  const nodoSujeto = resolSujeto?.nodoClave || null;
  const controlesSujeto = tipo !== "empresa" && activo && sujeto ? (
    <>
      {resolSujeto?.estado === "sin_mapeo" && (
        <p className="text-[11px] text-amber-700">
          Sin ubicación en el mapeo documental.{" "}
          <Link to="/configuracion/ia?tab=mapeo" className="font-bold text-primary hover:underline">Ir al Mapeo documental</Link>
        </p>
      )}
      {resolSujeto?.estado === "sugerida" && <p className="text-[11px] text-amber-700">Varios archivos posibles: ábralo y confírmelo.</p>}
      {puedeConfirmarUbicacion && nodoSujeto && visor && !candidatos.some((a) => a.ruta === visor) && (
        <button type="button" disabled={confirmando} onClick={() => confirmarUbicacion(nodoSujeto, sujeto.id, visor)} className={CLASE_SECUNDARIO}>
          <FolderTree className="w-3.5 h-3.5" /> Confirmar este documento para el requerimiento
        </button>
      )}
      {bloqueAlias}
    </>
  ) : null;

  const encabezado = activo ? (
    <PanelRequerimientoIA
      key={idActivo}
      datos={activo}
      ctx={{ tipoEntidad: tipo, sujeto, empresa, proyecto }}
      expedienteId={expedienteId}
      archivoAbierto={archivoAbierto}
      puedeDefinirReglas={puedeDefinirReglas}
      onCerrar={() => abrirRequerimiento?.(null)}
      carpeta={tipo === "empresa" ? controlesCarpetaEmpresa : controlesSujeto}
      documento={listoParaUbicar ? {
        opciones: [
          ...candidatos.map((a) => ({ ruta: a.ruta, nombre: a.nombre, candidato: true })),
          ...enLista.archivos.filter((a) => !candidatos.includes(a)).map((a) => ({ ruta: a.ruta, nombre: a.nombre, candidato: false })),
        ],
        actual: visor,
        onElegir: (r) => { setArchivo(null); setVisor(r || null); },
        noEncontrado: candidatos.length === 0,
      } : null}
    />
  ) : null;
  const conEncabezado = (contenido) => (encabezado ? (
    <div className="flex flex-col h-full min-h-0">
      {encabezado}
      <div className="flex-1 min-h-0 flex flex-col">{contenido}</div>
    </div>
  ) : contenido);

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
          <>
            <p>La fuente documental del Mandante no está autorizada en este navegador.</p>
            <button type="button" onClick={onIrADocumentacion} className="font-bold text-primary hover:underline">Autorizarla en la pestaña Documentación</button>
          </>
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
        {archivos.map((a) => (
          <li key={a.ruta}>
            <button type="button" onClick={() => abrir(a)} title={`Ver ${a.nombre}`}
              className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-primary-lighter/50">
              <IconoArchivo nombre={a.nombre} />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-xs font-semibold text-carbon-dark">{a.nombre}</span>
                <span className="block text-[10px] text-slate-400">{(extensionDe(a.nombre) || "archivo").toUpperCase()} · {formatTamano(a.tamanoBytes)} · {formatFecha(a.ultimaModificacion)}</span>
                {activo && candidatos.includes(a) && (
                  <span className="mt-0.5 inline-block px-1.5 py-px rounded-full bg-primary-lighter text-primary text-[10px] font-bold">{activo.instancia.nombreCorto || activo.instancia.nombre}</span>
                )}
              </span>
              <Eye className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {selectorAsignar}
    </div>
  );
};
