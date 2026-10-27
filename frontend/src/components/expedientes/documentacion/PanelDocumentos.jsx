import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Eye, File, FileImage, FileText, Folder, FolderTree, KeyRound, Link2,
  Maximize2, Minimize2, Search,
} from "lucide-react";
import { useCarpetaExpediente } from "../../../hooks/useCarpetaExpediente";
import { listarDirectorio, obtenerArchivo } from "../../../services/fuentes/carpetaLocal";
import { expedienteService } from "../../../services/expedienteService";
import { repositorioDocumentalService } from "../../../services/repositorioDocumentalService";
import { esImagen, esPdf, extensionDe, formatTamano, MAPEO_VACIO } from "../../../utils/repositorioDocumental";
import { formatFecha } from "../../../utils/fechas";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO, MENSAJE_SIN_SOPORTE } from "./estilos";
import { SelectorCarpeta } from "./SelectorCarpeta";
import { VisorArchivo } from "./VisorArchivo";
import { usePanelDocumentos } from "./panelDocumentosContexto";

const IconoArchivo = ({ nombre }) => {
  const Icono = esPdf(nombre) ? FileText : esImagen(nombre) ? FileImage : File;
  return <Icono className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />;
};
const Mensaje = ({ children }) => <div className="p-4 text-xs text-slate-500 space-y-2">{children}</div>;
const BOTON_ICONO = "p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-carbon-dark disabled:opacity-30 disabled:hover:bg-transparent";

// Panel de documentos junto a la evaluación (Empresa, Personas, Recursos): SOLO previsualiza. Muestra
// la carpeta del contexto dentro del repositorio del expediente, sin subir de ella:
//  - Persona / Recurso: su carpetaRelativa (o "Asignar carpeta", que la guarda en su participación).
//  - Empresa: la carpeta del requerimiento elegido (mapeo.requerimientos) o la raíz sin las carpetas
//    del personal y de maquinarias, con "Asociar esta carpeta al requerimiento".
// Lista ↔ visor: la lista conserva filtro y scroll; el visor navega ‹ › por la lista filtrada.
// La evaluación de la izquierda sigue usable mientras tanto. Acceso de solo lectura.
export const PanelDocumentos = ({
  expedienteId, usuarioId, repositorio, tipo, sujeto, carpetaSujeto = null, puedeEditar,
  onIrADocumentacion, onRepositorio, onCarpetaAsignada,
}) => {
  const carpeta = useCarpetaExpediente(usuarioId, expedienteId, { onRepositorio });
  const { expandible, expandido, alternarExpandido, informarArchivo } = usePanelDocumentos();
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
  const rutaRequerimiento = requerimientoId ? mapeo.requerimientos?.[requerimientoId] || null : null;

  // Carpeta de contexto: de ella no se sube.
  const base = tipo === "empresa" ? (rutaRequerimiento && !explorarRaiz ? rutaRequerimiento : "") : carpetaSujeto;
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

  // ── Estados sin listado ──
  if (!repositorio) {
    return (
      <Mensaje>
        <p>Este expediente aún no tiene configurada la ubicación de su documentación.</p>
        <button type="button" onClick={onIrADocumentacion} className="font-bold text-primary hover:underline">Configurar en la pestaña Documentación</button>
      </Mensaje>
    );
  }
  if (repositorio.tipo === "sharepoint") {
    return (
      <Mensaje>
        <p>La documentación está en SharePoint: <b>{repositorio.etiqueta}</b>.</p>
        <a href={repositorio.url} target="_blank" rel="noopener noreferrer" className={CLASE_SECUNDARIO}><ExternalLink className="w-3.5 h-3.5" /> Abrir carpeta en SharePoint</a>
        <p className="text-[11px] text-slate-400">La vista previa integrada de SharePoint estará disponible en una próxima fase.</p>
      </Mensaje>
    );
  }
  if (!carpeta.soportado) return <Mensaje><p>{MENSAJE_SIN_SOPORTE}</p></Mensaje>;
  if (carpeta.cargando) return <Mensaje><p>Cargando carpeta...</p></Mensaje>;
  if (!carpeta.handle) {
    return (
      <Mensaje>
        <p>La carpeta «{repositorio.etiqueta}» no está vinculada en este equipo.</p>
        <button type="button" onClick={carpeta.vincular} className={CLASE_PRIMARIO}><Link2 className="w-4 h-4" /> Vincular carpeta</button>
        {carpeta.error && <p className="text-red-600">{carpeta.error}</p>}
      </Mensaje>
    );
  }
  if (carpeta.permiso !== "granted") {
    return (
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
    if (!sujeto) return <Mensaje><p>{tipo === "persona" ? "Selecciona una persona para ver sus documentos" : "Selecciona un recurso para ver sus documentos"}</p></Mensaje>;
    if (!carpetaSujeto) {
      return (
        <Mensaje>
          <p>{tipo === "persona" ? "Esta persona" : "Este recurso"} aún no tiene carpeta asignada.</p>
          {puedeEditar && <button type="button" onClick={() => setAsignando(true)} className={CLASE_PRIMARIO}><FolderTree className="w-4 h-4" /> Asignar carpeta</button>}
          {error && <p className="text-red-600">{error}</p>}
          {selectorAsignar}
        </Mensaje>
      );
    }
  }
  if (listado === "no_existe" && ruta === base) {
    return (
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
    return (
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
  const req = requerimientos.find((r) => r.requerimientoId === requerimientoId);
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-slate-100 space-y-2">
        {tipo === "empresa" && (
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
        {tipo === "empresa" && requerimientoId && rutaRequerimiento && !explorarRaiz && (
          <p className="text-[11px] text-slate-500">
            Carpeta de {req?.nombreCorto || "este requerimiento"}: <b className="text-carbon-dark">{rutaRequerimiento}</b>{" "}
            {puedeEditar && <button type="button" onClick={() => setExplorarRaiz(true)} className="font-bold text-primary hover:underline">Cambiar</button>}
          </p>
        )}
        {tipo === "empresa" && requerimientoId && puedeEditar && base === "" && ruta && ruta !== rutaRequerimiento && (
          <button type="button" onClick={asociarRequerimiento} className={CLASE_SECUNDARIO}>
            <FolderTree className="w-3.5 h-3.5" /> Asociar esta carpeta al requerimiento
          </button>
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
