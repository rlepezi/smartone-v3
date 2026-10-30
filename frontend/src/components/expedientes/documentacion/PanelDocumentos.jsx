import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Eye, File, FileImage, FileText, Folder, FolderTree, KeyRound, Link2,
  Maximize2, Minimize2, RefreshCw, Search,
} from "lucide-react";
import { useCarpetaExpediente } from "../../../hooks/useCarpetaExpediente";
import { useAnalisisCarpeta } from "../../../hooks/useAnalisisCarpeta";
import { archivosDeUbicacion, rutaDeUbicacion } from "../../../utils/analisisCarpeta";
import { carpetaEsDe } from "../../../utils/carpetasSujetos";
import { listarDirectorio, obtenerArchivo } from "../../../services/fuentes/carpetaLocal";
import { expedienteService } from "../../../services/expedienteService";
import { repositorioDocumentalService } from "../../../services/repositorioDocumentalService";
import { esImagen, esPdf, extensionDe, formatTamano, MAPEO_VACIO } from "../../../utils/repositorioDocumental";
import { rutasDeRequerimiento } from "../../../utils/carpetaExpediente";
import { formatFecha, formatFechaHora } from "../../../utils/fechas";
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
const ORIGEN_ESTRUCTURA = {
  plantilla: "Según la estructura de carpetas (vínculo en la plantilla)",
  tipo: "Según la estructura de carpetas (por tipo documental)",
};

// De dónde sale la ubicación cuando depende del análisis de estructura: su fecha y "Reanalizar"; sin
// análisis, se muestra la raíz.
const LineaAnalisis = ({ texto, analisis, analizando, error, puedeReanalizar, onReanalizar }) => (
  <div className="text-[11px] text-slate-500 space-y-0.5">
    {texto && <p>{texto}</p>}
    <p className="flex flex-wrap items-center gap-x-2">
      {analisis ? <span>Análisis de estructura del {formatFechaHora(analisis.fecha)}</span> : <span>Sin análisis de estructura: se muestra la raíz.</span>}
      {puedeReanalizar && (
        <button type="button" onClick={onReanalizar} disabled={analizando} className="inline-flex items-center gap-1 font-bold text-primary hover:underline disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${analizando ? "animate-spin" : ""}`} /> {analizando ? "Analizando..." : analisis ? "Reanalizar" : "Analizar"}
        </button>
      )}
    </p>
    {error && <p className="text-red-600">{error}</p>}
  </div>
);

// Panel de documentos junto a la evaluación (Empresa, Personas, Recursos): SOLO previsualiza. Muestra
// la carpeta del contexto dentro del repositorio del expediente, sin subir de ella:
//  - Persona / Recurso: su carpetaRelativa (o "Asignar carpeta", que la guarda en su participación).
//  - Empresa: la carpeta del requerimiento elegido, con precedencia (`ubicaciones`, de la configuración
//    de Revisiones IA): 1° la asignada en el expediente (mapeo.requerimientos), 2° la del vínculo de la
//    plantilla y 3° la del tipo documental (estas dos, según el último análisis de estructura: con su
//    fecha y "Reanalizar"); sin ninguna, la raíz sin las carpetas del personal y de maquinarias, con
//    "Asociar esta carpeta al requerimiento".
//  - Persona / Recurso: los archivos que el análisis calzó con los documentos de cada requerimiento
//    llevan su nombre.
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
  expedienteId, usuarioId, mandanteId, repositorio, tipo, sujeto, carpetaSujeto = null, puedeEditar,
  onIrADocumentacion, onRepositorio, onCarpetaAsignada, empresa = null, carpeta, ubicaciones = null,
  puedeReanalizar = false, proyecto = null, puedeDefinirReglas = false, origenCarpeta = null,
}) => {
  const {
    expandible, expandido, alternarExpandido, informarArchivo, archivoAbierto, requerimientoActivo, abrirRequerimiento,
  } = usePanelDocumentos();
  const { analisis, analizando, error: errorAnalisis, reanalizar } = useAnalisisCarpeta(usuarioId, expedienteId, mandanteId);
  const mapeo = repositorio?.mapeo || MAPEO_VACIO;
  const local = repositorio?.tipo === "local";

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
  const rutaRequerimiento = requerimientoId ? rutasDeRequerimiento({ mapeo }, requerimientoId)[0] || null : null;
  const ubicacion = tipo === "empresa" && requerimientoId ? ubicaciones?.[requerimientoId] || null : null;
  const porEstructura = Boolean(ubicacion && !rutaRequerimiento && ORIGEN_ESTRUCTURA[ubicacion.nivel]);
  const rutaEstructura = porEstructura ? rutaDeUbicacion(ubicacion, analisis) : null;

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
  const base = tipo === "empresa" ? (explorarRaiz ? "" : rutaRequerimiento || rutaEstructura || "") : carpetaDelSujeto;

  // Archivos que el análisis calzó con los documentos de cada requerimiento: nombre → requerimientos.
  const marcados = new Map();
  const marcar = (u, entidadCarpeta) => archivosDeUbicacion(u, analisis, entidadCarpeta)
    .forEach((n) => marcados.set(n, [...(marcados.get(n) || []), u.nombre]));
  if (tipo === "empresa" && porEstructura) marcar(ubicacion, "");
  const ubicacionesSujeto = tipo !== "empresa" ? Object.values(ubicaciones || {})
    .filter((u) => u.tipoEntidad === tipo && ORIGEN_ESTRUCTURA[u.nivel]) : [];
  if (carpetaDelSujeto) ubicacionesSujeto.forEach((u) => marcar(u, carpetaDelSujeto));
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
      const raizMapeo = (tipo === "persona" ? mapeo.carpetaPersonas : mapeo.carpetaRecursos) || null;
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
    // esSuya y mapeo dependen de sujeto/carpetaSujeto/repositorio, ya en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, sujeto?.id, carpetaSujeto, local, carpeta.lista, carpeta.handle, repositorio]);

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
  // En Empresa, la raíz no muestra las carpetas del personal ni de maquinarias.
  const excluidas = tipo === "empresa" ? new Set([mapeo.carpetaPersonas, mapeo.carpetaRecursos].filter(Boolean)) : new Set();
  const subcarpetas = enLista.carpetas.filter((c) => !excluidas.has(c.ruta) && (!texto || c.nombre.toLowerCase().includes(texto)));
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
  const asociarRequerimiento = async () => {
    setError(null);
    try {
      const datos = await repositorioDocumentalService.actualizar(expedienteId, {
        mapeo: { ...mapeo, requerimientos: { ...(mapeo.requerimientos || {}), [requerimientoId]: ruta } },
      });
      onRepositorio?.(datos);
      setExplorarRaiz(false);
    } catch (err) {
      setError(err.message || "No se pudo asociar la carpeta.");
    }
  };

  // ── Modo requerimiento (ícono IA de un requisito de la planilla) ──
  // Ubica el documento con la misma precedencia (carpeta asignada en el expediente, vínculo de la
  // plantilla, tipo documental): en Empresa elige la carpeta del requerimiento; en Persona/Recurso,
  // los archivos de su carpeta que el análisis calzó con sus documentos. Abre el primero; si no hay,
  // deja la lista para elegir.
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
  const ubicacionActiva = reqActivoId ? ubicaciones?.[reqActivoId] || null : null;
  // null: todos los archivos de la carpeta asignada a mano (mapeo) son candidatos.
  const nombresCandidatos = !activo ? [] : tipo === "empresa"
    ? (rutaRequerimiento ? null : archivosDeUbicacion(ubicacionActiva, analisis, ""))
    : archivosDeUbicacion(ubicacionActiva, analisis, carpetaSujeto);
  const listoParaUbicar = Boolean(activo) && Boolean(listado) && listado !== "no_existe" && ruta === base;
  const candidatos = listoParaUbicar
    ? enLista.archivos.filter((a) => nombresCandidatos === null || nombresCandidatos.includes(a.nombre)) : [];
  const claveUbicacion = listoParaUbicar ? `${idActivo}|${base}` : null;
  const [ubicacionHecha, setUbicacionHecha] = useState(null);
  if (claveUbicacion && claveUbicacion !== ubicacionHecha) {
    setUbicacionHecha(claveUbicacion);
    setArchivo(null);
    setVisor(candidatos[0]?.ruta || null);
  }
  // Empresa: dónde está el documento del requerimiento (carpeta asignada en el expediente, ubicación
  // por estructura, o "Asociar esta carpeta"). En modo requerimiento se muestran en el encabezado,
  // entre el requerimiento y sus reglas (el flujo: qué requisito → dónde está → qué revisar).
  const controlesCarpetaEmpresa = tipo === "empresa" && requerimientoId ? (
    <>
      {rutaRequerimiento && !explorarRaiz && (
        <p className="text-[11px] text-slate-500">
          Carpeta del requerimiento (asignada en el expediente): <b className="text-carbon-dark">{rutaRequerimiento}</b>{" "}
          {puedeEditar && <button type="button" onClick={() => setExplorarRaiz(true)} className="font-bold text-primary hover:underline">Cambiar</button>}
        </p>
      )}
      {porEstructura && !explorarRaiz && (
        <LineaAnalisis
          texto={`${ORIGEN_ESTRUCTURA[ubicacion.nivel]}: ${ubicacion.documentos.map((d) => [d.seccion, d.documento].filter(Boolean).join(" › ")).join(", ")}`}
          analisis={analisis} analizando={analizando} error={errorAnalisis}
          puedeReanalizar={puedeReanalizar} onReanalizar={() => reanalizar(carpeta.handle)}
        />
      )}
      {puedeEditar && base === "" && ruta && ruta !== rutaRequerimiento && (
        <button type="button" onClick={asociarRequerimiento} className={CLASE_SECUNDARIO}>
          <FolderTree className="w-3.5 h-3.5" /> Asociar esta carpeta al requerimiento
        </button>
      )}
      {puedeEditar && base === "" && !ruta && !rutaRequerimiento && (
        <p className="text-[11px] text-slate-500">Abra la carpeta donde está el documento y presione «Asociar esta carpeta al requerimiento».</p>
      )}
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
      carpeta={controlesCarpetaEmpresa}
      mapeoExpediente={tipo === "empresa" ? mapeo : null}
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
      rutaInicial={(tipo === "persona" ? mapeo.carpetaPersonas : mapeo.carpetaRecursos) || ""}
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
                <option key={r.id} value={r.requerimientoId}>{r.nombreCorto || r.nombre}{mapeo.requerimientos?.[r.requerimientoId] ? " · 📁" : ""}</option>
              ))}
            </select>
          </label>
        )}
        {!activo && controlesCarpetaEmpresa}
        {tipo !== "empresa" && avisoBusqueda}
        {tipo !== "empresa" && ubicacionesSujeto.length > 0 && (
          <LineaAnalisis
            texto={null}
            analisis={analisis} analizando={analizando} error={errorAnalisis}
            puedeReanalizar={puedeReanalizar} onReanalizar={() => reanalizar(carpeta.handle)}
          />
        )}
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
                {marcados.has(a.nombre) && (
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {marcados.get(a.nombre).map((n) => (
                      <span key={n} className="px-1.5 py-px rounded-full bg-primary-lighter text-primary text-[10px] font-bold">{n}</span>
                    ))}
                  </span>
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
