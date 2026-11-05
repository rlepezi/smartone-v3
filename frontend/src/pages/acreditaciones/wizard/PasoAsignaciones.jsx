import React, { useEffect, useState } from "react";
import { PatenteChip } from "../../../components/shared/PatenteChip";
import { Search, Plus, Info, AlertCircle, AlertTriangle } from "lucide-react";
import { acreditacionService } from "../../../services/acreditacionService";
import { personaService } from "../../../services/personaService";
import { recursoService } from "../../../services/recursoService";
import { listarDirectorio } from "../../../services/fuentes/carpetaLocal";
import { carpetaUnicaDe, separarNombreApellido } from "../../../utils/carpetasSujetos";
import { formatRutDisplay } from "../../../utils/rutFormatters";
import { SelectorCarpeta } from "../../../components/expedientes/documentacion/SelectorCarpeta";
import { CarpetaCabecera } from "./CarpetaDetectadaBloque";
import { useFilasDetectadas, contarPendientes } from "./carpetaDetectada";
import { ListadoSujetos } from "./ListadoSujetos";
import { registradaDe } from "../../../utils/listadoPersonal";
import { registradoDe, vehiculosDeListado } from "../../../utils/listadoVehiculos";
import { personasDeListado } from "../../../utils/listadoPersonal";
import { leerPlanilla } from "../../../utils/planillas";
import { obtenerArchivo } from "../../../services/fuentes/carpetaLocal";
import { perfilRecursoService } from "../../../services/perfilRecursoService";
import { ErrorBanner } from "../../../components/shared/ErrorBanner";
import { ActionButton } from "../../../components/shared/ActionButton";
import { ModalCrearPersona } from "../../../components/shared/ModalCrearPersona";
import { ModalCrearRecurso } from "../../../components/shared/ModalCrearRecurso";
import { CrearPerfilRecurso } from "../../../components/perfiles-recurso/CrearPerfilRecurso";
import { SelectorPerfilRecurso } from "../../../components/perfiles-recurso/SelectorPerfilRecurso";
import { CLASE_RESALTADO, refRecurso } from "../asistenteNavegacion";
import {
  PanelSeleccionEntidades, BadgesDisponibilidad, disponibilidadDe,
} from "../../../components/acreditaciones/PanelSeleccionEntidades";

const MAX_FILAS_CORTAS = 5;

// Paso opcional: arma en memoria la lista de Personas/Recursos a asignar, cada una con sus
// Perfiles de Recurso (por ID, de los activos del Mandante; Personas: uno o más, Maquinarias:
// uno) — no crea nada ni traslada todavía. Eso ocurre recién al confirmar en el paso de Confirmación,
// vía acreditacionService.asignarEntidad (mismo mecanismo de "Cambiar Proyecto"/"Reemplazar
// Acreditación": si ya están activos en otro Proyecto, los mueve en vez de fallar).
// `mostrarErrores`: se intentó continuar con seleccionados sin perfil — marca esas filas y muestra
// el resumen "Faltan perfiles…", cuyos nombres llevan a cada fila (`onIrAProblema(ref)`).
export const PasoAsignaciones = ({
  mandanteId, empresaId, proyectoSel, seleccion, onCambiarSeleccion, mostrarErrores = false, onIrAProblema,
  // Carpeta local vinculada en el paso Empresa (hook useCarpetaWizard) o null (sin carpeta o SharePoint),
  // su mapeo { carpetaPersonas, carpetaRecursos } y cómo cambiarlo.
  carpeta = null, mapeo = null, onCambiarMapeo,
  // Paso de un solo tipo ("persona": Personas, "recurso": Maquinarias), sin pestañas. Sin él, las dos
  // pestañas como antes.
  soloTipo = null,
  // Listado leído de una planilla abierta en la vista de la carpeta: { tipo ("persona" | "recurso"),
  // ruta, nombre, filas } | null (personas: listadoPersonal.js; vehículos: listadoVehiculos.js).
  listado = null, onQuitarListado,
  // Listado elegido en el selector de carpeta: onListado(tipo, { tipo, ruta, nombre, filas }).
  onListado = null,
}) => {
  const [avisoListado, setAvisoListado] = useState(null);
  // Fila del listado que se está creando (formulario prellenado): { tipo, fila }.
  const [crearDesdeListado, setCrearDesdeListado] = useState(null);
  const [personas, setPersonas] = useState([]);
  const [recursos, setRecursos] = useState([]);
  // Perfiles de Recurso activos del Mandante (persona y maquinaria).
  const [perfilesMandante, setPerfilesMandante] = useState([]);
  const [perfilesCargados, setPerfilesCargados] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchPersonas, setSearchPersonas] = useState("");
  const [searchRecursos, setSearchRecursos] = useState("");
  const [modalPersonaAbierto, setModalPersonaAbierto] = useState(false);
  const [modalRecursoAbierto, setModalRecursoAbierto] = useState(false);
  const [panelAbierto, setPanelAbierto] = useState(null); // "persona" | "recurso" | null
  // Sub-pestañas del paso: Personas | Maquinarias (ambas quedan montadas: selección, buscador y
  // scroll se conservan al cambiar).
  const [pestana, setPestana] = useState(soloTipo || "persona");
  // Repositorio documental: subcarpetas de la carpeta del personal / maquinarias, sujetos de otras
  // empresas (solo informativo), creación desde carpeta y asignación manual de carpeta.
  const [detectadas, setDetectadas] = useState({ persona: null, recurso: null });
  // Versión de la lectura de subcarpetas (fija: ya no hay "Volver a leer carpeta" en el paso).
  const [lectura] = useState(0);
  const [otros, setOtros] = useState({ persona: [], recurso: [] });
  const [crearDesde, setCrearDesde] = useState(null); // { tipo, fila }
  const [asignando, setAsignando] = useState(null); // { tipo, id }
  const rutaDe = (tipo) => (tipo === "persona" ? mapeo?.carpetaPersonas : mapeo?.carpetaRecursos) || null;
  const carpetaLista = Boolean(carpeta?.lista);
  // Visor "📄 Ver documento" de los modales de creación: listados de la carpeta del personal /
  // maquinarias y, al crear desde una carpeta, los archivos de esa carpeta (activo por defecto).
  const documentoPara = (tipo) => {
    const desdeCarpeta = crearDesde?.tipo === tipo ? crearDesde.fila : null;
    const rutaListados = rutaDe(tipo);
    if (!carpetaLista || (!rutaListados && !desdeCarpeta)) return null;
    return {
      handle: carpeta.handle, tipo, rutaListados,
      rutaPropia: desdeCarpeta?.carpeta.ruta || null,
      nombrePropio: desdeCarpeta?.limpio.display || null,
      activoInicial: Boolean(desdeCarpeta),
    };
  };

  const proyectoActualId = proyectoSel?.id;
  // Seleccionadas (del tipo del paso) activas en otro proyecto: requieren traslado al confirmar.
  const enOtroProyecto = seleccion.filter((s) => (!soloTipo || s.tipo === soloTipo)
    && s.participacionActiva && s.participacionActiva.proyectoId !== proyectoActualId);

  const cargar = () => {
    if (!empresaId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      acreditacionService.listarEntidadesDeEmpresa({ empresaId, tipo: "persona" }),
      acreditacionService.listarEntidadesDeEmpresa({ empresaId, tipo: "maquinaria" }),
    ])
      .then(([personasData, recursosData]) => {
        setPersonas(personasData || []);
        setRecursos(recursosData || []);
      })
      .catch((err) => setError(err.message || "No se pudieron cargar Personas y Maquinarias."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, [empresaId]);

  const cargarPerfiles = () => perfilRecursoService
    .listar({ mandanteId, estado: "activo" })
    .then((data) => setPerfilesMandante(data || []))
    .catch((err) => console.error("Error al cargar perfiles de recurso:", err))
    .finally(() => setPerfilesCargados(true));

  useEffect(() => {
    if (!mandanteId) return;
    cargarPerfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandanteId]);

  // Subcarpetas de la carpeta del personal / maquinarias (solo lectura).
  const rutaPersonas = rutaDe("persona");
  const rutaRecursos = rutaDe("recurso");
  useEffect(() => {
    if (!carpetaLista) return undefined;
    let vigente = true;
    const leer = (ruta) => (ruta
      ? listarDirectorio(carpeta.handle, ruta).then((l) => l?.carpetas || []).catch(() => [])
      : Promise.resolve(null));
    Promise.all([leer(rutaPersonas), leer(rutaRecursos)])
      .then(([p, r]) => { if (vigente) setDetectadas({ persona: p, recurso: r }); });
    return () => { vigente = false; };
  }, [carpetaLista, carpeta?.handle, rutaPersonas, rutaRecursos, lectura]);

  // Personas/Maquinarias de otras empresas: para avisar "Existe en otra empresa" (no se vinculan aquí).
  const hayRuta = Boolean(rutaPersonas || rutaRecursos);
  useEffect(() => {
    if (!carpetaLista || !hayRuta || !empresaId) return undefined;
    let vigente = true;
    const deOtras = (lista) => (lista || []).filter((x) => x.empresaActual?.empresaId && x.empresaActual.empresaId !== empresaId);
    Promise.all([personaService.listar("activo").catch(() => []), recursoService.listar("activo").catch(() => [])])
      .then(([p, r]) => { if (vigente) setOtros({ persona: deOtras(p), recurso: deOtras(r) }); });
    return () => { vigente = false; };
  }, [carpetaLista, hayRuta, empresaId]);

  const filasPersonas = useFilasDetectadas(detectadas.persona, "persona", personas, otros.persona);
  const filasRecursos = useFilasDetectadas(detectadas.recurso, "recurso", recursos, otros.recurso);

  const estaSeleccionado = (tipo, id) => seleccion.some((s) => s.tipo === tipo && s.id === id);
  const buscarSeleccion = (tipo, id) => seleccion.find((s) => s.tipo === tipo && s.id === id);

  const perfilesDe = (tipo) => perfilesMandante.filter((p) => p.tipo === (tipo === "persona" ? "persona" : "recurso"));
  const sinPerfiles = (tipo) => perfilesCargados && perfilesDe(tipo).length === 0;

  // Perfil recién creado desde este paso: se recarga la lista sin tocar la selección, salvo que
  // fuera el primero de su tipo; entonces se asigna a los ya seleccionados de ese tipo sin perfil.
  const handlePerfilCreado = ({ id, tipo }) => {
    const eraElPrimero = perfilesDe(tipo).length === 0;
    cargarPerfiles();
    if (!eraElPrimero || !id) return;
    onCambiarSeleccion(seleccion.map((s) => (
      s.tipo === tipo && !(s.perfilRecursoIds || []).length ? { ...s, perfilRecursoIds: [id] } : s
    )));
  };

  // Perfil preseleccionado: el del mismo nombre que la Función propia de la Persona (cargo de su relación activa)
  // o que la clasificación descriptiva de la Maquinaria (tipo) — nunca el primero del catálogo,
  // que es arbitrario. Si no hay coincidencia queda vacío y se elige a mano.
  const perfilSugerido = (tipo, item) => {
    const texto = ((tipo === "persona" ? item.empresaActual?.cargo : item.tipo) || "").trim().toLowerCase();
    const p = perfilesDe(tipo).find((x) => x.nombre.trim().toLowerCase() === texto);
    return p ? [p.id] : [];
  };

  const armarItem = (tipo, item) => ({
    tipo,
    id: item.id,
    nombre: tipo === "persona" ? `${item.nombre} ${item.apellido || ""}`.trim() : item.nombre,
    perfilRecursoIds: perfilSugerido(tipo, item),
    participacionActiva: item.participacionActiva || null,
  });

  // Un solo clic, también para quien está en otro proyecto: queda "Requiere traslado" y el
  // traslado real ocurre recién al confirmar el wizard.
  // Con la carpeta del personal/maquinarias elegida, si hay UNA subcarpeta que coincide se le asigna
  // como carpetaRelativa.
  const toggle = (tipo, item) => {
    if (disponibilidadDe(item, proyectoActualId) === "este") return;
    if (estaSeleccionado(tipo, item.id)) {
      onCambiarSeleccion(seleccion.filter((s) => !(s.tipo === tipo && s.id === item.id)));
    } else {
      const unica = detectadas[tipo] ? carpetaUnicaDe(detectadas[tipo], tipo, item) : null;
      onCambiarSeleccion([...seleccion, { ...armarItem(tipo, item), carpetaRelativa: unica?.ruta || null }]);
    }
  };

  // Desde "Detectadas en carpeta": agrega (o actualiza) el seleccionado con su carpeta. Actualización
  // funcional: "Seleccionar todas las sugeridas" la llama varias veces seguidas.
  const esSeleccionable = (item) => disponibilidadDe(item, proyectoActualId) !== "este";
  const seleccionarConCarpeta = (tipo, item, carpetaRelativa) => {
    if (!esSeleccionable(item)) return;
    onCambiarSeleccion((prev) => (prev.some((s) => s.tipo === tipo && s.id === item.id)
      ? prev.map((s) => (s.tipo === tipo && s.id === item.id ? { ...s, carpetaRelativa } : s))
      : [...prev, { ...armarItem(tipo, item), carpetaRelativa }]));
  };
  const asignarCarpeta = (tipo, id, carpetaRelativa) => onCambiarSeleccion((prev) => prev.map((s) => (
    s.tipo === tipo && s.id === id ? { ...s, carpetaRelativa } : s)));

  // Persona: uno o más perfiles. Maquinaria: uno solo (lo resuelve SelectorPerfilRecurso).
  const cambiarPerfiles = (tipo, id, perfilRecursoIds) => {
    onCambiarSeleccion(seleccion.map((s) => (s.tipo === tipo && s.id === id ? { ...s, perfilRecursoIds } : s)));
  };
  // El panel "Ver todas" entrega los ids finales de ese tipo; se conservan las entradas ya
  // existentes (con sus perfiles elegidos) y se agregan/quitan solo las diferencias.
  const aplicarSeleccionPanel = (tipo, ids) => {
    const catalogo = tipo === "persona" ? personas : recursos;
    const idsSet = new Set(ids);
    const otros = seleccion.filter((s) => s.tipo !== tipo);
    const mantenidos = seleccion.filter((s) => s.tipo === tipo && idsSet.has(s.id));
    const nuevos = catalogo
      .filter((i) => idsSet.has(i.id) && !mantenidos.some((m) => m.id === i.id))
      .map((i) => armarItem(tipo, i));
    onCambiarSeleccion([...otros, ...mantenidos, ...nuevos]);
    setPanelAbierto(null);
  };

  // Creada desde el botón de siempre o desde una carpeta no registrada (queda con esa carpeta).
  const handlePersonaCreada = (persona) => {
    setModalPersonaAbierto(false);
    const conEstado = { ...persona, participacionActiva: null };
    setPersonas((prev) => [...prev, conEstado]);
    if (crearDesde?.tipo === "persona") seleccionarConCarpeta("persona", conEstado, crearDesde.fila.carpeta.ruta);
    else toggle("persona", conEstado);
    setCrearDesde(null);
    setCrearDesdeListado(null);
  };

  const handleRecursoCreado = (recurso) => {
    setModalRecursoAbierto(false);
    const conEstado = { ...recurso, participacionActiva: null };
    setRecursos((prev) => [...prev, conEstado]);
    if (crearDesde?.tipo === "recurso") seleccionarConCarpeta("recurso", conEstado, crearDesde.fila.carpeta.ruta);
    else toggle("recurso", conEstado);
    setCrearDesde(null);
    setCrearDesdeListado(null);
  };

  // Lista corta: los seleccionados primero y completos, luego el resto hasta MAX_FILAS_CORTAS; el
  // buscador filtra sobre todo el catálogo.
  const listaCorta = (items, tipo, termino, textoDe) => {
    const t = termino.trim().toLowerCase();
    const filtrados = items.filter((i) => !t || textoDe(i).toLowerCase().includes(t));
    const seleccionados = filtrados.filter((i) => estaSeleccionado(tipo, i.id));
    const resto = filtrados.filter((i) => !estaSeleccionado(tipo, i.id));
    // Todos los seleccionados quedan a la vista (cada uno necesita su selector de perfil).
    return [...seleccionados, ...resto.slice(0, Math.max(0, MAX_FILAS_CORTAS - seleccionados.length))];
  };

  // Seleccionados sin Perfil de Recurso (bloquean "Continuar"); en un paso de un solo tipo, los de
  // ese tipo.
  const sinPerfilAsignado = seleccion.filter((s) => (!soloTipo || s.tipo === soloTipo) && !(s.perfilRecursoIds || []).length);
  // Lleva a la fila: sin búsqueda activa, para que la fila esté en la lista.
  const irAFila = (s) => {
    setPestana(s.tipo);
    if (s.tipo === "persona") setSearchPersonas(""); else setSearchRecursos("");
    onIrAProblema?.(refRecurso(s.tipo, s.id));
  };

  const textoPersona = (p) => `${p.nombre} ${p.apellido || ""} ${p.rut || ""} ${p.cargo || ""}`;
  const textoRecurso = (r) => `${r.nombre} ${r.patente || ""} ${r.tipo || ""}`;

  // Una pestaña (Personas o Maquinarias) a todo el ancho: encabezado de una fila (carpeta · buscador ·
  // crear · perfil · ver todas), "Detectadas en carpeta" y los recursos, una línea por fila.
  // Planilla elegida como listado en el selector de carpeta: se lee aquí (personas: nombre, RUT y
  // cargo; vehículos: descripción, patente, marca y modelo).
  const elegirListado = async (tipo, rutaArchivo) => {
    setAvisoListado(null);
    try {
      const archivo = await obtenerArchivo(carpeta.handle, rutaArchivo);
      if (!archivo) throw new Error("No se encontró el archivo.");
      const hojas = await leerPlanilla(archivo);
      const filas = tipo === "persona" ? personasDeListado(hojas) : vehiculosDeListado(hojas);
      if (!filas.length) {
        setAvisoListado(`«${archivo.name}» no tiene una tabla reconocible de ${tipo === "persona" ? "personas (nombre y RUT)" : "vehículos (patente o N° de serie, y descripción, marca o modelo)"}.`);
        return;
      }
      onListado?.(tipo, { tipo, ruta: rutaArchivo, nombre: archivo.name, filas });
    } catch (err) {
      setAvisoListado(err.message || "No se pudo leer la planilla.");
    }
  };

  // Selector de Perfil de Recurso de un seleccionado (en la lista de la pestaña o en el listado).
  const selectorPerfil = (tipo, i, nombre) => {
    const sel = buscarSeleccion(tipo, i.id);
    if (!sel || sinPerfiles(tipo)) return null;
    const conError = mostrarErrores && !(sel.perfilRecursoIds || []).length;
    return (
      <SelectorPerfilRecurso
        tamano="sm"
        tipo={tipo}
        perfiles={perfilesDe(tipo)}
        valor={sel.perfilRecursoIds || []}
        onChange={(ids) => cambiarPerfiles(tipo, i.id, ids)}
        mandanteId={mandanteId}
        onPerfilCreado={cargarPerfiles}
        error={conError ? "Elige un perfil" : null}
        etiqueta={`Perfil de Recurso de ${nombre}`}
      />
    );
  };

  const renderPestana = ({ tipo, items: todos, termino, setTermino, textoDe, nombreDe, onCrear, etiquetaCrear, vacio, buscar }) => {
    // Con listado (del personal o de vehículos), los que están en él se eligen (y se les asigna el
    // perfil) solo en el listado: la lista de abajo queda con los demás de la empresa, sin repetirlos.
    const conListado = Boolean(listado) && listado.tipo === tipo;
    const coincide = tipo === "persona" ? registradaDe : registradoDe;
    const enListado = conListado
      ? new Set(listado.filas.map((f) => coincide(f, todos)?.id).filter(Boolean)) : null;
    const items = conListado ? todos.filter((i) => !enListado.has(i.id)) : todos;
    const cortas = listaCorta(items, tipo, termino, textoDe);
    const ruta = rutaDe(tipo);
    return (
      <div className="space-y-3">
        <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-white flex flex-wrap items-center gap-2 border-b border-slate-100">
          <CarpetaCabecera tipo={tipo} carpeta={carpeta} ruta={ruta} onElegirRuta={(r) => onCambiarMapeo?.(tipo, r)}
            onElegirListado={onListado ? (r) => elegirListado(tipo, r) : null} />
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text" value={termino} onChange={(e) => setTermino(e.target.value)} placeholder={buscar}
              className="w-full pl-9 pr-3 py-1.5 bg-gray-50/50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <ActionButton variant="primary" icon={Plus} onClick={onCrear}>{etiquetaCrear}</ActionButton>
          <button type="button" onClick={() => setPanelAbierto(tipo)} className="text-[11px] font-bold text-primary hover:text-primary-dark whitespace-nowrap">
            Ver todas ({items.length}) →
          </button>
        </div>
        {sinPerfiles(tipo) && (
          <CrearPerfilRecurso tipo={tipo} mandanteId={mandanteId} onCreado={handlePerfilCreado} />
        )}
        {avisoListado && <p role="alert" className="text-[11px] text-amber-700">{avisoListado}</p>}
        {conListado && (
          <ListadoSujetos
            tipo={tipo}
            listado={listado}
            sujetos={todos}
            proyectoActualId={proyectoActualId}
            faltaPerfil={(p) => { const s = buscarSeleccion(tipo, p.id); return Boolean(s) && !(s.perfilRecursoIds || []).length && !sinPerfiles(tipo); }}
            renderPerfil={(p) => selectorPerfil(tipo, p, nombreDe(p))}
            refDe={(p) => refRecurso(tipo, p.id)}
            estaSeleccionado={(id) => estaSeleccionado(tipo, id)}
            esSeleccionable={esSeleccionable}
            onAlternar={(item) => toggle(tipo, item)}
            onSeleccionarTodas={(registradas) => onCambiarSeleccion((prev) => [
              ...prev,
              ...registradas.filter((p) => esSeleccionable(p) && !prev.some((s) => s.tipo === tipo && s.id === p.id))
                .map((p) => ({ ...armarItem(tipo, p), carpetaRelativa: null })),
            ])}
            onCrear={(fila) => {
              setCrearDesde(null);
              setCrearDesdeListado({ tipo, fila });
              if (tipo === "persona") setModalPersonaAbierto(true); else setModalRecursoAbierto(true);
            }}
            onQuitar={onQuitarListado}
          />
        )}
        {/* "Detectadas en carpeta" ya no se muestra: las subcarpetas se siguen leyendo para asignar
            sola la carpeta de cada seleccionado cuando una sola coincide (ver toggle). */}
        {conListado && items.length > 0 && (
          <p className="pt-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            {tipo === "persona" ? "Otras personas" : "Otras maquinarias"} de la empresa ({items.length})
          </p>
        )}
        {conListado && items.length === 0 ? null : items.length === 0 ? (
          !ruta ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-[11px] text-slate-400">{vacio}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <CarpetaCabecera tipo={tipo} carpeta={carpeta} ruta={ruta} onElegirRuta={(r) => onCambiarMapeo?.(tipo, r)}
            onElegirListado={onListado ? (r) => elegirListado(tipo, r) : null} />
                <ActionButton variant="primary" icon={Plus} onClick={onCrear}>{etiquetaCrear}</ActionButton>
              </div>
            </div>
          ) : null
        ) : cortas.length === 0 ? (
          <p className="text-[11px] text-slate-400 py-4 text-center">Sin resultados.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {cortas.map((i) => {
              const sel = buscarSeleccion(tipo, i.id);
              const deshabilitada = disponibilidadDe(i, proyectoActualId) === "este";
              const faltaPerfil = Boolean(sel) && !(sel.perfilRecursoIds || []).length;
              const conError = mostrarErrores && faltaPerfil && !sinPerfiles(tipo);
              return (
                <div
                  key={i.id}
                  data-asistente-ref={refRecurso(tipo, i.id)}
                  className={`flex flex-wrap lg:flex-nowrap items-center gap-x-3 gap-y-1 py-1.5 px-2 -mx-2 rounded-lg scroll-mt-24 ${CLASE_RESALTADO} ${deshabilitada ? "opacity-60" : ""} ${
                    conError ? "border border-red-300 bg-red-50/40" : "border border-transparent"
                  }`}
                >
                  <label className={`flex items-center gap-2 min-w-0 flex-1 ${deshabilitada ? "cursor-not-allowed" : "cursor-pointer"}`}>
                    <input
                      type="checkbox" checked={Boolean(sel)} disabled={deshabilitada} onChange={() => toggle(tipo, i)}
                      className="w-4 h-4 shrink-0 rounded border-gray-300 text-primary focus:ring-primary/30"
                    />
                    <span className="text-xs font-semibold text-carbon-dark truncate">{nombreDe(i)}</span>
                    {tipo === "persona"
                      ? <span className="text-[11px] text-slate-400 shrink-0">{i.rut ? formatRutDisplay(i.rut) : ""}</span>
                      : <span className="shrink-0"><PatenteChip valor={i.patente} tipo={i.tipoIdentificacion} /></span>}
                    {faltaPerfil && !sinPerfiles(tipo) && (
                      <span title="Sin Perfil de Recurso asignado" aria-label="Sin Perfil de Recurso asignado"
                        className="shrink-0 inline-flex items-center gap-1 px-1.5 rounded bg-amber-100 text-[10px] font-semibold text-amber-800">
                        <AlertTriangle className="w-3 h-3" />{(tipo === "persona" ? i.empresaActual?.cargo : i.tipo) || "Sin perfil"}
                      </span>
                    )}
                    <BadgesDisponibilidad item={i} proyectoActualId={proyectoActualId} seleccionada={Boolean(sel)} />
                    {sel && carpetaLista && ruta && (sel.carpetaRelativa ? (
                      <span title={sel.carpetaRelativa} className="shrink-0 px-1.5 rounded-full text-[10px] font-bold bg-sage-lighter text-sage-darker border border-sage-light">📁</span>
                    ) : (
                      <button type="button" onClick={(e) => { e.preventDefault(); setAsignando({ tipo, id: i.id }); }}
                        title="Sin carpeta: haga clic para asignarla" className="shrink-0 px-1.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100">
                        ⚠ sin carpeta
                      </button>
                    ))}
                  </label>
                  {sel && !sinPerfiles(tipo) && (
                    <div className="shrink-0 w-full lg:w-72">{selectorPerfil(tipo, i, nombreDe(i))}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const pestanas = [
    { tipo: "persona", texto: "👥 Personas", filas: filasPersonas },
    { tipo: "recurso", texto: "🚚 Maquinarias", filas: filasRecursos },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-gray-900">{soloTipo === "persona" ? "Personas" : soloTipo === "recurso" ? "Maquinarias" : "Personas y Maquinarias"}</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Selecciona {soloTipo === "persona" ? "las personas" : soloTipo === "recurso" ? "las maquinarias" : "las personas y maquinarias"} que
          participarán en {proyectoSel?.nombre || "el proyecto"}. Puedes continuar sin {soloTipo === "persona" ? "asignar personas" : soloTipo === "recurso" ? "asignar maquinarias" : "asignar recursos"} y
          agregarlas posteriormente desde el proyecto.
        </p>
        <p className="flex items-start gap-1.5 text-[11px] text-slate-500 mt-2">
          <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-px" />
          Si {soloTipo === "recurso" ? "una maquinaria" : soloTipo === "persona" ? "una persona" : "una persona o maquinaria"} ya está activa en otro proyecto, podrás trasladarla a este proyecto antes de confirmar.
        </p>
      </div>

      <ErrorBanner message={error} />

      {/* Seleccionadas que ya están activas en OTRO proyecto: al confirmar se trasladan (su asignación
          actual se finaliza). Se avisa siempre, a la vista, mientras sigan seleccionadas. */}
      {enOtroProyecto.length > 0 && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-amber-600" />
          <div className="space-y-1 min-w-0">
            <p className="font-bold">
              {enOtroProyecto.length === 1
                ? `1 ${soloTipo === "recurso" ? "maquinaria seleccionada ya está activa" : soloTipo === "persona" ? "persona seleccionada ya está activa" : "seleccionada ya está activa"} en otro proyecto`
                : `${enOtroProyecto.length} ${soloTipo === "recurso" ? "maquinarias seleccionadas ya están activas" : soloTipo === "persona" ? "personas seleccionadas ya están activas" : "seleccionadas ya están activas"} en otro proyecto`}
            </p>
            <ul className="space-y-0.5">
              {enOtroProyecto.map((s) => (
                <li key={`${s.tipo}-${s.id}`}>
                  <b>{s.nombre}</b> — {s.participacionActiva?.proyectoNombre || "otro proyecto"}
                </li>
              ))}
            </ul>
            <p>
              Al confirmar la acreditación {enOtroProyecto.length === 1 ? "se trasladará" : "se trasladarán"} a {proyectoSel?.nombre || "este proyecto"} y
              {enOtroProyecto.length === 1 ? " su asignación actual se finalizará" : " sus asignaciones actuales se finalizarán"}. Si no corresponde, quítalas de la selección.
            </p>
          </div>
        </div>
      )}

      {mostrarErrores && sinPerfilAsignado.length > 0 && (
        <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 space-y-1.5">
          <p className="flex items-center gap-1.5 font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Faltan perfiles en {sinPerfilAsignado.length} {sinPerfilAsignado.length === 1 ? "recurso" : "recursos"}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 pl-5">
            {sinPerfilAsignado.map((s) => (
              <button
                key={`${s.tipo}-${s.id}`}
                type="button"
                onClick={() => irAFila(s)}
                className="font-semibold underline underline-offset-2 hover:text-red-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
              >
                {s.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400 py-8 text-center">Cargando Personas y Maquinarias de la Empresa...</p>
      ) : (
        <div className="space-y-3">
          <div className={`flex gap-1 border-b border-slate-200 ${soloTipo ? "hidden" : ""}`} role="tablist" aria-label="Personas y Maquinarias">
            {pestanas.map((p) => {
              const cantidad = seleccion.filter((x) => x.tipo === p.tipo).length;
              const pendientes = carpetaLista && rutaDe(p.tipo) ? contarPendientes(p.filas, (id) => estaSeleccionado(p.tipo, id)) : 0;
              return (
                <button key={p.tipo} type="button" role="tab" aria-selected={pestana === p.tipo} onClick={() => setPestana(p.tipo)}
                  className={`relative px-4 py-2 -mb-px text-xs font-bold border-b-2 ${pestana === p.tipo ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-carbon-dark"}`}>
                  {p.texto} ({cantidad})
                  {pendientes > 0 && (
                    <span title={`${pendientes} detectadas sin resolver`} className="absolute top-1.5 right-1 w-2 h-2 rounded-full bg-amber-500" aria-label={`${pendientes} detectadas sin resolver`} />
                  )}
                </button>
              );
            })}
          </div>
          <div className={pestana === "persona" ? "" : "hidden"} role="tabpanel">
            {renderPestana({
              tipo: "persona", items: personas, filas: filasPersonas,
              termino: searchPersonas, setTermino: setSearchPersonas, textoDe: textoPersona,
              nombreDe: (p) => `${p.nombre} ${p.apellido || ""}`.trim(),
              onCrear: () => setModalPersonaAbierto(true), etiquetaCrear: "Crear Persona", buscar: "Buscar Persona...",
              vacio: "Todavía no hay Personas activas para esta Empresa — puedes crear una nueva.",
            })}
          </div>
          <div className={pestana === "recurso" ? "" : "hidden"} role="tabpanel">
            {renderPestana({
              tipo: "recurso", items: recursos, filas: filasRecursos,
              termino: searchRecursos, setTermino: setSearchRecursos, textoDe: textoRecurso,
              nombreDe: (r) => r.nombre,
              onCrear: () => setModalRecursoAbierto(true), etiquetaCrear: "Crear Maquinaria", buscar: "Buscar Maquinaria...",
              vacio: "Todavía no hay Maquinarias activas para esta Empresa — puedes crear una nueva.",
            })}
          </div>
        </div>
      )}

      {panelAbierto && (
        <PanelSeleccionEntidades
          tipo={panelAbierto}
          items={panelAbierto === "persona" ? personas : recursos}
          seleccionIds={seleccion.filter((s) => s.tipo === panelAbierto).map((s) => s.id)}
          proyectoActualId={proyectoActualId}
          onAplicar={(ids) => aplicarSeleccionPanel(panelAbierto, ids)}
          onCerrar={() => setPanelAbierto(null)}
        />
      )}

      {modalPersonaAbierto && (
        <ModalCrearPersona
          empresaId={empresaId}
          mandanteId={mandanteId}
          inicial={crearDesdeListado?.tipo === "persona"
            ? { nombre: crearDesdeListado.fila.nombre, apellido: crearDesdeListado.fila.apellido, rut: crearDesdeListado.fila.rut, cargo: crearDesdeListado.fila.cargo }
            : crearDesde?.tipo === "persona" ? separarNombreApellido(crearDesde.fila.limpio.display) : null}
          documento={documentoPara("persona")}
          onCreada={handlePersonaCreada}
          onCerrar={() => { setModalPersonaAbierto(false); setCrearDesde(null); setCrearDesdeListado(null); }}
        />
      )}
      {modalRecursoAbierto && (
        <ModalCrearRecurso
          empresaId={empresaId}
          mandanteId={mandanteId}
          inicial={crearDesdeListado?.tipo === "recurso" ? {
            nombre: crearDesdeListado.fila.nombre, patente: crearDesdeListado.fila.patente || "",
            tipoIdentificacion: crearDesdeListado.fila.tipoIdentificacion || "patente",
            descripcion: crearDesdeListado.fila.descripcion || "", marca: crearDesdeListado.fila.marca,
            modelo: crearDesdeListado.fila.modelo, anio: crearDesdeListado.fila.anio,
            perfilSugerido: crearDesdeListado.fila.descripcion,
          } : crearDesde?.tipo === "recurso" ? { nombre: crearDesde.fila.limpio.display, patente: crearDesde.fila.patente || "" } : null}
          documento={documentoPara("recurso")}
          onCreada={handleRecursoCreado}
          onCerrar={() => { setModalRecursoAbierto(false); setCrearDesde(null); setCrearDesdeListado(null); }}
        />
      )}
      {asignando && carpetaLista && (
        <SelectorCarpeta
          handle={carpeta.handle}
          rutaInicial={rutaDe(asignando.tipo) || ""}
          titulo="Carpeta de esta persona o maquinaria"
          onElegir={(ruta) => { asignarCarpeta(asignando.tipo, asignando.id, ruta); setAsignando(null); }}
          onCerrar={() => setAsignando(null)}
        />
      )}
    </div>
  );
};
