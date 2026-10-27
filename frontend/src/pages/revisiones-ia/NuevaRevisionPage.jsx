import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, FileText, FolderClock, FolderOpen, ScanSearch, Sparkles, UserRound } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useMandanteContexto } from "../../hooks/useMandanteContexto";
import { CampoMandante } from "../../components/shared/CampoMandante";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { PlanEmpresaCard } from "../../components/revisiones-ia/PlanEmpresaCard";
import { AlcancePanel } from "../../components/revisiones-ia/AlcancePanel";
import { revisionIAService } from "../../services/revisionIAService";
import { plantillaEstructuraService } from "../../services/plantillaEstructuraService";
import { empresaService } from "../../services/empresaService";
import { expedienteService } from "../../services/expedienteService";
import { proyectoService } from "../../services/proyectoService";
import {
  soportaSelectorCarpeta, elegirConSelector, leerArbolDesdeInput, obtenerCarpetaPredeterminada,
  estadoPermiso, leerCarpeta,
} from "../../services/fuentes/carpetaLocal";
import { iniciarEjecucion } from "../../services/fuentes/ejecutorRevision";
import { MOTIVO_EXCLUSION, SIN_ENLACE, formatUsd } from "../../utils/revisionIA";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";

const PASOS = ["Mandante", "Carpeta y estructura", "Confirmar"];
const CLASE_INPUT = "w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all";
const CLASE_PRIMARIO = "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed";
const CLASE_SECUNDARIO = "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-carbon-dark hover:bg-slate-50 disabled:opacity-50";
const ROLES_CONFIGURAN = ["superadmin", "mandante_admin"];

const Aviso = ({ children }) => (
  <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
    <span>{children}</span>
  </div>
);

// Enlace inicial de cada empresa: la sugerencia del plan, sin confirmar. Con un solo expediente
// abierto (o uno con proyecto parecido), queda preseleccionado.
const enlaceInicial = (empresa) => {
  const sugerido = empresa.enlaceSugerido;
  if (!sugerido) return { empresaId: "", expedienteId: "", confirmado: false };
  const expedientes = sugerido.expedientes || [];
  const elegido = expedientes.length === 1 ? expedientes[0]
    : expedientes.find((x) => (x.similitudProyecto || 0) >= 0.6) || null;
  return { empresaId: sugerido.empresaId, expedienteId: elegido?.expedienteId || "", confirmado: false };
};

// Asistente "Nueva revisión" de Revisiones IA: 1) Mandante, nombre y fuente; 2) carpeta y análisis
// de estructura contra la plantilla del Mandante (empresas, secciones, personas, archivos para la
// IA y costo); 3) modo y confirmación. Al iniciar persiste la completitud y, si el modo incluye IA,
// envía solo los archivos que el plan marcó.
export const NuevaRevisionPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const contexto = useMandanteContexto();
  const { mandanteId, modo: modoMandante } = contexto;
  const usuarioId = profile?.uid;
  const [paso, setPaso] = useState(0);
  const [nombre, setNombre] = useState("");
  const [estadoIA, setEstadoIA] = useState(null);
  const [plantilla, setPlantilla] = useState(null);
  const [predeterminada, setPredeterminada] = useState(null);
  const [lectura, setLectura] = useState(null);
  const [plan, setPlan] = useState(null);
  const [calces, setCalces] = useState({});
  const [enlaces, setEnlaces] = useState({});
  const [modo, setModo] = useState("completitud");
  // "plantilla": se compara con la estructura del Mandante. "libre": cualquier carpeta; todo archivo
  // legible va a la IA, que detecta el tipo, y la persona se enlaza por el RUN del documento.
  const [modoEstructura, setModoEstructura] = useState("plantilla");
  const [opciones, setOpciones] = useState({ empresas: [], expedientes: [] });
  const [analizando, setAnalizando] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // Estado de la IA, plantilla activa y opciones de enlace del Mandante.
  useEffect(() => {
    if (!mandanteId) return undefined;
    let vigente = true;
    Promise.all([
      revisionIAService.estado(mandanteId).catch(() => ({ configurada: false })),
      plantillaEstructuraService.obtenerActiva(mandanteId).catch(() => null),
      empresaService.listar("activo", { mandanteId }).catch(() => []),
      expedienteService.listar({ mandanteId }).catch(() => []),
      proyectoService.listar({ mandanteId }).catch(() => []),
    ]).then(([estado, plantillaActiva, empresas, expedientes, proyectos]) => {
      if (!vigente) return;
      const nombreProyecto = new Map((proyectos || []).map((p) => [p.id, [p.codigo, p.nombre].filter(Boolean).join(" · ")]));
      setEstadoIA(estado);
      setPlantilla(plantillaActiva);
      // Sin plantilla, la única forma de revisar es como carpeta libre.
      if (!plantillaActiva) {
        setModoEstructura("libre");
        setModo("completitud_ia");
      }
      setOpciones({
        empresas: [...(empresas || [])].sort((a, b) => (a.razonSocial || "").localeCompare(b.razonSocial || "", "es")),
        expedientes: (expedientes || []).filter((x) => x.estado !== "cerrado")
          .map((x) => ({ id: x.id, empresaId: x.empresaId, estado: x.estado, proyectoNombre: nombreProyecto.get(x.proyectoId) || x.proyectoId })),
      });
    });
    return () => { vigente = false; };
  }, [mandanteId]);

  useEffect(() => {
    let vigente = true;
    obtenerCarpetaPredeterminada(usuarioId, mandanteId)
      .then((reg) => { if (vigente) setPredeterminada(reg); })
      .catch(() => { if (vigente) setPredeterminada(null); });
    return () => { vigente = false; };
  }, [usuarioId, mandanteId]);

  // Mandante distinto: todo lo demás depende de él.
  const [mandanteVista, setMandanteVista] = useState(mandanteId);
  if (mandanteVista !== mandanteId) {
    setMandanteVista(mandanteId);
    setLectura(null);
    setPlan(null);
    setCalces({});
    setEnlaces({});
  }

  const enlacesPayload = (actuales) => Object.fromEntries(Object.entries(actuales).map(([carpeta, e]) => [
    carpeta, e.empresaId && e.empresaId !== SIN_ENLACE ? { empresaId: e.empresaId, expedienteId: e.expedienteId || null } : null,
  ]));

  const analizar = async (leida, nuevosCalces = calces, nuevosEnlaces = enlaces, estructura = modoEstructura) => {
    if (!leida) return;
    setAnalizando(true);
    setError(null);
    try {
      const resultado = await revisionIAService.analizar({
        mandanteId, arbol: leida.arbol, calcesManuales: nuevosCalces, modoEstructura: estructura,
        enlaces: Object.fromEntries(Object.entries(enlacesPayload(nuevosEnlaces)).filter(([, e]) => e)),
      });
      // Carpeta libre: siempre con IA (no hay completitud que medir).
      if (estructura === "libre") setModo("completitud_ia");
      setLectura(leida);
      setPlan(resultado);
      // Enlaces: se conservan los ya elegidos; las empresas nuevas parten con la sugerencia.
      setEnlaces((previos) => Object.fromEntries(resultado.empresas.map((e) => [
        e.empresaCarpeta, previos[e.empresaCarpeta] || nuevosEnlaces[e.empresaCarpeta] || enlaceInicial(e),
      ])));
      if (!nombre.trim()) setNombre(`${leida.carpetaRaizNombre} ${new Date().toLocaleDateString("es-CL")}`);
    } catch (err) {
      setError(err.message || "No se pudo analizar la carpeta.");
    } finally {
      setAnalizando(false);
    }
  };

  const nuevaLectura = (leida) => {
    if (!leida) return;
    setCalces({});
    setEnlaces({});
    return analizar(leida, {}, {});
  };

  const cambiarModoEstructura = (estructura) => {
    setModoEstructura(estructura);
    setModo(estructura === "libre" ? "completitud_ia" : "completitud");
    if (lectura) analizar(lectura, {}, {}, estructura);
  };

  const elegirCarpeta = async () => {
    setError(null);
    if (!soportaSelectorCarpeta()) {
      inputRef.current?.click();
      return;
    }
    try {
      setAnalizando(true);
      await nuevaLectura(await elegirConSelector(predeterminada?.handle || null));
    } catch (err) {
      setError(err.message || "No se pudo abrir la carpeta.");
    } finally {
      setAnalizando(false);
    }
  };

  const usarPredeterminada = async () => {
    setError(null);
    try {
      setAnalizando(true);
      const leida = await leerCarpeta(predeterminada.handle);
      if (!leida) {
        setError("El navegador no dio permiso para leer la carpeta. Elija otra carpeta.");
        return;
      }
      await nuevaLectura(leida);
    } catch {
      setError("No se pudo abrir la carpeta predeterminada (quizás se movió o se eliminó). Elija otra carpeta.");
    } finally {
      setAnalizando(false);
    }
  };

  // Al llegar al paso de la carpeta, la predeterminada con permiso concedido se lee directo.
  const irAPaso = async (siguiente) => {
    setPaso(siguiente);
    if (siguiente === 1 && !lectura && predeterminada &&
        (await estadoPermiso(predeterminada.handle).catch(() => "prompt")) === "granted") {
      await usarPredeterminada();
    }
  };

  const corregirCalce = (empresaCarpeta, carpeta, seccionClave) => {
    const nuevos = { ...calces, [empresaCarpeta]: { ...(calces[empresaCarpeta] || {}), [carpeta]: seccionClave } };
    setCalces(nuevos);
    analizar(lectura, nuevos, enlaces);
  };

  const cambiarEnlace = (empresaCarpeta, enlace) => {
    const nuevos = { ...enlaces, [empresaCarpeta]: enlace };
    setEnlaces(nuevos);
    // Cambió la Empresa: las personas se sugieren con la nueva.
    if (enlace.empresaId !== enlaces[empresaCarpeta]?.empresaId) analizar(lectura, calces, nuevos);
  };

  const empresas = useMemo(() => plan?.empresas || [], [plan]);
  const archivosIA = empresas.flatMap((e) => e.archivosIA);
  const excluidosPorMotivo = useMemo(() => {
    const conteo = {};
    empresas.forEach((e) => e.archivosExcluidosIA.forEach((x) => { conteo[x.motivo] = (conteo[x.motivo] || 0) + 1; }));
    return conteo;
  }, [empresas]);
  const todosConfirmados = empresas.length > 0 && empresas.every((e) => enlaces[e.empresaCarpeta]?.confirmado);
  const iaDisponible = Boolean(estadoIA?.configurada) && estadoIA?.preciosConfigurados !== false && !plan?.faltanPrecios;
  const sinPlantilla = estadoIA !== null && !plantilla;
  const libre = modoEstructura === "libre";
  // Sin documentos habilitados en la plantilla no hay nada que revisar.
  const sinDocumentos = libre ? archivosIA.length === 0 : Boolean(plan?.alcance && !plan.alcance.resumen.documentosHabilitados);
  const puedeConfigurar = ROLES_CONFIGURAN.includes(profile?.rol);

  const iniciar = async () => {
    setIniciando(true);
    setError(null);
    try {
      const { sesion, archivosIA: paraEnviar } = await revisionIAService.crearSesion({
        mandanteId, nombre: nombre.trim(), carpetaRaizNombre: lectura.carpetaRaizNombre, modo, modoEstructura,
        arbol: lectura.arbol, calcesManuales: calces, enlaces: enlacesPayload(enlaces),
      });
      if (modo === "completitud_ia" && paraEnviar.length) {
        iniciarEjecucion(sesion.id, paraEnviar
          .map((meta) => ({ meta, archivo: lectura.archivos.get(meta.rutaRelativa) }))
          .filter((t) => t.archivo));
      }
      navigate(`/revisiones-ia/${sesion.id}`);
    } catch (err) {
      setError(err.message || "No se pudo iniciar la revisión.");
      setIniciando(false);
    }
  };

  const puedeAvanzar = [
    Boolean(mandanteId),
    libre
      ? plan?.tipoEstructura === "libre" && !analizando && !sinDocumentos && iaDisponible
      : Boolean(plan?.tipoEstructura) && todosConfirmados && !analizando && !sinDocumentos,
    true,
  ][paso];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate("/revisiones-ia")} aria-label="Volver" className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 shadow-sm">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Nueva revisión</h2>
          <p className="text-xs text-gray-500">SmartOne compara la carpeta con la plantilla de estructura del Mandante y, si lo elige, valida con IA los documentos normalizados.</p>
        </div>
      </div>

      <ol className="flex flex-wrap items-center gap-2 text-xs">
        {PASOS.map((p, i) => (
          <li key={p} className={`flex items-center gap-2 ${i === paso ? "text-primary font-bold" : i < paso ? "text-sage-dark font-semibold" : "text-slate-400"}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border ${i === paso ? "bg-primary text-white border-primary" : i < paso ? "bg-sage-lighter border-sage-light" : "bg-white border-slate-200"}`}>{i + 1}</span>
            {p}
            {i < PASOS.length - 1 && <span className="w-8 h-px bg-slate-200" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <ErrorBanner message={error} />
      {sinPlantilla && (
        <Aviso>
          El Mandante no tiene una plantilla de estructura activa: solo puede revisar como carpeta libre.{" "}
          {puedeConfigurar
            ? <Link to="/configuracion/ia?tab=estructura" className="font-bold underline">Configúrela en Configuración → Inteligencia Artificial → Estructura de carpetas.</Link>
            : "Contacta a un administrador."}
        </Aviso>
      )}

      <section className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-5">
        {paso === 0 && (
          <>
            <CampoMandante contexto={contexto} conFoco={modoMandante === "seleccionable"} />
            <fieldset>
              <legend className="block text-xs font-semibold text-gray-700 mb-1.5">Fuente de los documentos</legend>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary bg-primary-lighter/50 text-xs">
                  <input type="radio" name="fuente" checked readOnly className="text-primary" /> Carpeta local
                </label>
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-100 text-xs text-slate-400 cursor-not-allowed" title="Disponible en la próxima versión">
                  <input type="radio" name="fuente" disabled /> SharePoint
                  <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">Próximamente</span>
                </label>
              </div>
            </fieldset>
            {plantilla && <p className="text-[11px] text-slate-500">Plantilla: <span className="font-semibold">{plantilla.nombre}</span> (versión {plantilla.version})</p>}
            <div>
              <label htmlFor="revision-nombre" className="block text-xs font-semibold text-gray-700 mb-1.5">Nombre de la revisión (opcional)</label>
              <input id="revision-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} placeholder="Por defecto: nombre de la carpeta y fecha" className={CLASE_INPUT} />
            </div>
          </>
        )}

        {paso === 1 && (
          <>
            <fieldset>
              <legend className="block text-xs font-semibold text-gray-700 mb-1.5">Cómo leer la carpeta</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className={`flex items-start gap-2 p-3 rounded-xl border text-xs ${!plantilla ? "border-slate-100 text-slate-400 cursor-not-allowed" : "cursor-pointer"} ${!libre ? "border-primary bg-primary-lighter/50" : "border-slate-200"}`}>
                  <input type="radio" name="modoEstructura" checked={!libre} disabled={!plantilla || analizando} onChange={() => cambiarModoEstructura("plantilla")} className="mt-0.5 text-primary" />
                  <span><span className="font-bold">Según la plantilla{plantilla ? ` (${plantilla.nombre})` : ""}</span><br />Completitud por sección y persona; la IA valida los documentos habilitados.</span>
                </label>
                <label className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer text-xs ${libre ? "border-primary bg-primary-lighter/50" : "border-slate-200"}`}>
                  <input type="radio" name="modoEstructura" checked={libre} disabled={analizando} onChange={() => cambiarModoEstructura("libre")} className="mt-0.5 text-primary" />
                  <span><span className="font-bold">Carpeta libre (sin estructura)</span><br />Cualquier carpeta: la IA lee todos los PDF, imágenes y Word, detecta el tipo de documento y lo enlaza a la persona por su RUN.</span>
                </label>
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={elegirCarpeta} disabled={analizando} className={CLASE_PRIMARIO}>
                <FolderOpen className="w-4 h-4" /> {analizando ? "Analizando estructura..." : lectura ? "Elegir otra carpeta" : "Elegir carpeta"}
              </button>
              {predeterminada && !lectura && (
                <button type="button" onClick={usarPredeterminada} disabled={analizando} className={CLASE_SECUNDARIO}>
                  <FolderClock className="w-4 h-4" /> Usar carpeta predeterminada ({predeterminada.handle.name})
                </button>
              )}
              <input
                ref={inputRef} type="file" multiple className="hidden" webkitdirectory="" directory=""
                onChange={(e) => { nuevaLectura(leerArbolDesdeInput(e.target.files)); e.target.value = ""; }}
              />
              {lectura && <span className="text-xs text-slate-500">Carpeta: <span className="font-bold text-carbon-dark">{lectura.carpetaRaizNombre}</span></span>}
            </div>
            <p className="text-[11px] text-slate-400">
              Puede ser la carpeta de arranque de una empresa o un repositorio con varias. Solo se leen los nombres y tamaños; los archivos se abren al iniciar, y solo los que van a la IA.
            </p>

            {plan && !plan.tipoEstructura && (
              <Aviso>
                {plan.advertencias[0]} Carpetas revisadas: {(plan.detalle || []).map((d) => `${d.carpeta} (${d.seccionesReconocidas} secciones)`).join(" · ") || "ninguna"}.{" "}
                <button type="button" onClick={() => cambiarModoEstructura("libre")} className="font-bold underline">Revisar como carpeta libre</button>
              </Aviso>
            )}

            {!libre && plan?.alcance && <AlcancePanel alcance={plan.alcance} compacto abierto={false} puedeEditar={puedeConfigurar} />}

            {libre && plan?.tipoEstructura === "libre" && (
              <PlanLibre empresa={empresas[0]} iaDisponible={iaDisponible} estadoIA={estadoIA} plan={plan} excluidosPorMotivo={excluidosPorMotivo} />
            )}

            {!libre && plan?.tipoEstructura && (
              <>
                <p className="text-xs text-slate-600">
                  {plan.tipoEstructura === "repositorio" ? `Repositorio con ${empresas.length} ${empresas.length === 1 ? "empresa" : "empresas"}` : "Carpeta de una empresa"}
                  {" · "}Confirme la Empresa y el Expediente de cada una.
                </p>
                {empresas.map((e) => (
                  <PlanEmpresaCard
                    key={e.empresaCarpeta}
                    empresa={e}
                    seccionesPlantilla={plantilla?.secciones || []}
                    empresasOpciones={opciones.empresas}
                    expedientesOpciones={opciones.expedientes}
                    enlace={enlaces[e.empresaCarpeta] || { empresaId: "", expedienteId: "", confirmado: false }}
                    onEnlace={(enlace) => cambiarEnlace(e.empresaCarpeta, enlace)}
                    onCalce={(carpeta, clave) => corregirCalce(e.empresaCarpeta, carpeta, clave)}
                    deshabilitado={analizando}
                  />
                ))}
                {(plan.advertencias || []).length > 0 && (
                  <ul className="text-[11px] text-amber-700 list-disc pl-5">{plan.advertencias.map((a) => <li key={a}>{a}</li>)}</ul>
                )}

                <section className="rounded-2xl border border-primary/20 bg-primary-lighter/40 p-4 space-y-2">
                  <p className="flex items-center gap-2 text-sm font-bold text-carbon-dark"><Sparkles className="w-4 h-4 text-primary" /> Validación IA</p>
                  <p className="text-xs text-slate-600">
                    {archivosIA.length} {archivosIA.length === 1 ? "archivo" : "archivos"} a enviar (documentos con tipo normalizado y sin datos sensibles).
                    {" "}Costo estimado: <span className="font-black">{plan.faltanPrecios ? "sin precios configurados" : formatUsd(plan.costoEstimadoUsd, 4)}</span>
                  </p>
                  {Object.keys(excluidosPorMotivo).length > 0 && (
                    <p className="text-[11px] text-slate-500">
                      Excluidos: {Object.entries(excluidosPorMotivo).map(([m, n]) => `${MOTIVO_EXCLUSION[m] || m}: ${n}`).join(" · ")}
                    </p>
                  )}
                </section>
              </>
            )}
          </>
        )}

        {paso === 2 && plan && (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="block text-xs font-semibold text-gray-700 mb-1.5">Modo de revisión</legend>
              <label className={`flex items-start gap-2 p-3 rounded-xl border text-xs ${libre ? "border-slate-100 text-slate-400 cursor-not-allowed" : "cursor-pointer"} ${modo === "completitud" ? "border-primary bg-primary-lighter/50" : "border-slate-200"}`}>
                <input type="radio" name="modo" checked={modo === "completitud"} disabled={libre} onChange={() => setModo("completitud")} className="mt-0.5 text-primary" />
                <span><span className="font-bold">Solo completitud (US$0)</span><br />Qué secciones y documentos faltan o sobran, por empresa y por persona. Sin IA.</span>
              </label>
              <label className={`flex items-start gap-2 p-3 rounded-xl border text-xs ${!iaDisponible || !archivosIA.length ? "border-slate-100 text-slate-400 cursor-not-allowed" : "cursor-pointer"} ${modo === "completitud_ia" ? "border-primary bg-primary-lighter/50" : "border-slate-200"}`}>
                <input type="radio" name="modo" checked={modo === "completitud_ia"} disabled={!iaDisponible || !archivosIA.length} onChange={() => setModo("completitud_ia")} className="mt-0.5 text-primary" />
                <span>
                  <span className="font-bold">Completitud + validación IA ({plan.faltanPrecios ? "sin precios" : formatUsd(plan.costoEstimadoUsd, 4)})</span><br />
                  Además valida con IA {archivosIA.length} {archivosIA.length === 1 ? "archivo" : "archivos"} y propone una evaluación.
                  {!estadoIA?.configurada && " La IA no está configurada."}
                  {estadoIA?.configurada && !iaDisponible && " Configura los precios del modelo en Configuración → Inteligencia Artificial."}
                </span>
              </label>
            </fieldset>
            <div className="text-xs text-slate-600 space-y-1">
              <p><span className="font-semibold text-carbon-dark">Mandante:</span> {getMandanteDisplayName(contexto.mandante) || mandanteId}</p>
              <p><span className="font-semibold text-carbon-dark">Nombre:</span> {nombre.trim() || "(por defecto)"}</p>
              <p><span className="font-semibold text-carbon-dark">Carpeta:</span> {lectura.carpetaRaizNombre} · {libre ? "carpeta libre (sin estructura)" : `${empresas.length} ${empresas.length === 1 ? "empresa" : "empresas"}`}</p>
              <p className="text-[11px] text-slate-400">
                Mantenga esta pestaña abierta mientras se envían los archivos. Los archivos no se almacenan: solo se guardan los datos extraídos.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={() => setPaso((p) => p - 1)} disabled={paso === 0 || iniciando} className={CLASE_SECUNDARIO}>Atrás</button>
          {paso < PASOS.length - 1 ? (
            <button type="button" onClick={() => irAPaso(paso + 1)} disabled={!puedeAvanzar} className={CLASE_PRIMARIO}
              title={paso === 1 && plan?.tipoEstructura && !todosConfirmados ? "Confirme el enlace de cada empresa" : undefined}>
              Siguiente
            </button>
          ) : (
            <button type="button" onClick={iniciar} disabled={iniciando || sinDocumentos || (modo === "completitud_ia" && !iaDisponible)} className={CLASE_PRIMARIO}>
              <ScanSearch className="w-4 h-4" /> {iniciando ? "Iniciando..." : "Iniciar revisión"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
};

// Vista previa de una carpeta libre: personas (carpetas) con los archivos que irán a la IA.
const PlanLibre = ({ empresa, iaDisponible, estadoIA, plan, excluidosPorMotivo }) => {
  const porEntidad = new Map();
  empresa.archivosIA.forEach((a) => {
    if (!porEntidad.has(a.entidadClave)) porEntidad.set(a.entidadClave, []);
    porEntidad.get(a.entidadClave).push(a);
  });
  const entidadPorClave = new Map(empresa.entidades.map((e) => [e.entidadClave, e]));
  return (
    <section className="rounded-2xl border border-primary/20 bg-primary-lighter/40 p-4 space-y-3">
      <p className="flex items-center gap-2 text-sm font-bold text-carbon-dark"><Sparkles className="w-4 h-4 text-primary" /> Validación IA de carpeta libre</p>
      <p className="text-xs text-slate-600">
        {empresa.archivosIA.length} {empresa.archivosIA.length === 1 ? "archivo" : "archivos"} a enviar.
        {" "}Costo estimado: <span className="font-black">{plan.faltanPrecios ? "sin precios configurados" : formatUsd(plan.costoEstimadoUsd, 4)}</span>
        {" "}· La IA detecta el tipo de cada documento; los que no sean cédula ni licencia quedan como "Otro".
      </p>
      {!iaDisponible && (
        <Aviso>{estadoIA?.configurada ? "Configura los precios del modelo en Configuración → Inteligencia Artificial." : "La IA no está configurada."}</Aviso>
      )}
      {empresa.archivosIA.length === 0 ? (
        <p className="text-xs text-slate-500">No hay archivos que la IA pueda leer (PDF, JPG, PNG, WebP o Word .docx de hasta 10 MB).</p>
      ) : (
        <ul className="space-y-2">
          {[...porEntidad.entries()].map(([clave, archivos]) => {
            const entidad = entidadPorClave.get(clave);
            return (
              <li key={clave} className="rounded-xl bg-white border border-slate-100 px-3 py-2 text-xs">
                <p className="flex items-center gap-1.5 font-bold text-carbon-dark">
                  <UserRound className="w-3.5 h-3.5 text-slate-400" /> {entidad?.entidadNombre || "Persona"}
                  {entidad?.entidadCarpeta && <span className="font-normal text-slate-400 truncate">· {entidad.entidadCarpeta}</span>}
                </p>
                <ul className="mt-1 pl-5 text-slate-600">
                  {archivos.map((a) => <li key={a.rutaRelativa} className="flex items-center gap-1"><FileText className="w-3 h-3 text-slate-400" />{a.nombre}</li>)}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      {Object.keys(excluidosPorMotivo).length > 0 && (
        <p className="text-[11px] text-slate-500">
          Excluidos: {Object.entries(excluidosPorMotivo).map(([m, n]) => `${MOTIVO_EXCLUSION[m] || m}: ${n}`).join(" · ")}
        </p>
      )}
      <p className="text-[11px] text-slate-500">Cada documento se enlaza por el RUN que lee la IA con los expedientes abiertos de esa persona.</p>
    </section>
  );
};
