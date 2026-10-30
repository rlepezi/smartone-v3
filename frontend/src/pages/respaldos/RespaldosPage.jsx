import React, { useEffect, useMemo, useState } from "react";
import {
  DatabaseBackup, Power, Clock, CalendarClock, HardDrive, RotateCcw, ShieldCheck, History, ScrollText, X,
  AlertTriangle, Play,
} from "lucide-react";
import { respaldoService } from "../../services/respaldoService";
import { formatFechaHora } from "../../utils/fechas";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { ActionButton } from "../../components/shared/ActionButton";
import { RowActionsMenu } from "../../components/shared/RowActionsMenu";

const FRASE_CONFIRMACION = "RESTAURAR";
const FORMATO_DESTINO = /^gs:\/\/[a-z0-9][a-z0-9._-]{1,220}[a-z0-9](\/.*)?$/;

const aMs = (v) => {
  if (!v) return null;
  const ms = v._seconds ? v._seconds * 1000 : new Date(v).getTime();
  return Number.isNaN(ms) ? null : ms;
};
const fechaHora = (v) => (v ? formatFechaHora(v) : "—");
const formatoTamano = (bytes) => {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ["KB", "MB", "GB", "TB"];
  let valor = bytes / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) { valor /= 1024; i++; }
  return `${valor.toFixed(1)} ${unidades[i]}`;
};
const duracion = (r) => {
  const ini = aMs(r.fechaInicio);
  const fin = aMs(r.fechaFin);
  if (!ini || !fin) return "—";
  const seg = Math.max(0, Math.round((fin - ini) / 1000));
  return seg < 60 ? `${seg} s` : `${Math.floor(seg / 60)} min ${seg % 60} s`;
};

const ESTADO = {
  exitoso: { label: "Correcto", clase: "bg-sage-lighter text-sage-darker border-sage-light" },
  fallido: { label: "Error", clase: "bg-red-50 text-red-700 border-red-200" },
  en_progreso: { label: "En progreso", clase: "bg-amber-50 text-amber-700 border-amber-200" },
};
const InsigniaEstado = ({ estado }) => {
  const e = ESTADO[estado] || ESTADO.en_progreso;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${e.clase}`}>{e.label}</span>;
};

const tipoVisible = (r) => (r.tipo === "restauracion" ? "Restauración" : r.iniciadoPor === "sistema" ? "Automático" : "Manual");
const accionVisible = (r) => (
  r.tipo === "configuracion" ? "Modificó configuración" :
  r.tipo === "restauracion" ? "Restauración" :
  r.iniciadoPor === "sistema" ? "Respaldo automático" : "Respaldo manual"
);

const Tarjeta = ({ icono: Icono, titulo, children, derecha }) => (
  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
    <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-100">
      <div className="flex items-center gap-2">
        <Icono className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">{titulo}</h3>
      </div>
      {derecha}
    </div>
    {children}
  </div>
);

const Interruptor = ({ activo, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={activo}
    onClick={() => onChange(!activo)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${activo ? "bg-primary" : "bg-slate-300"}`}
  >
    <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${activo ? "translate-x-6" : "translate-x-1"}`} />
  </button>
);

const CLASE_CAMPO = "w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all";

export const RespaldosPage = () => {
  const [config, setConfig] = useState(null);
  // Copia de lo guardado en el servidor (KPIs de próximo respaldo, etc.), separada del formulario editable.
  const [configServidor, setConfigServidor] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [ejecutando, setEjecutando] = useState(false);
  const [restauracion, setRestauracion] = useState(null); // respaldo elegido para restaurar
  const [origenRestaurar, setOrigenRestaurar] = useState("");
  const [tabHistorial, setTabHistorial] = useState("todos");
  const [busqueda, setBusqueda] = useState("");

  const cargar = async () => {
    try {
      const [cfg, lista] = await Promise.all([respaldoService.obtenerConfiguracion(), respaldoService.listar()]);
      setConfig((prev) => prev || cfg);
      setConfigServidor(cfg);
      setHistorial(lista);
    } catch (err) {
      setError(err.message || "No se pudo cargar el módulo de respaldos.");
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  // Mientras haya operaciones en curso, se consulta su estado cada 10 s.
  const hayEnCurso = historial.some((r) => r.estado === "en_progreso");
  useEffect(() => {
    if (!hayEnCurso) return undefined;
    const t = setInterval(cargar, 10000);
    return () => clearInterval(t);
  }, [hayEnCurso]);

  const destinoValido = !config?.bucketDestino || FORMATO_DESTINO.test(config.bucketDestino.trim());
  const cambiar = (campo, valor) => setConfig((prev) => ({ ...prev, [campo]: valor }));

  const guardar = async () => {
    setError(null);
    setAviso(null);
    if (config.habilitado && !FORMATO_DESTINO.test((config.bucketDestino || "").trim())) {
      setError("El destino debe tener el formato gs://bucket/carpeta.");
      return;
    }
    setGuardando(true);
    try {
      const { configuracion, advertencia } = await respaldoService.guardarConfiguracion({
        habilitado: config.habilitado,
        intervaloDias: Number(config.intervaloDias),
        horaEjecucion: config.horaEjecucion,
        bucketDestino: (config.bucketDestino || "").trim(),
        retencionDias: Number(config.retencionDias),
        eliminarAntiguos: config.eliminarAntiguos,
      });
      setConfig(configuracion);
      setConfigServidor(configuracion);
      setAviso(advertencia || "Configuración guardada.");
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const probarAcceso = async () => {
    setError(null);
    setAviso(null);
    setProbando(true);
    try {
      await respaldoService.probarAcceso((config.bucketDestino || "").trim());
      setAviso("Acceso verificado: se pudo escribir y borrar un archivo de prueba en la carpeta de respaldos.");
    } catch (err) {
      setError(err.message);
    } finally {
      setProbando(false);
    }
  };

  const ejecutarAhora = async () => {
    setError(null);
    setAviso(null);
    setEjecutando(true);
    try {
      await respaldoService.ejecutar();
      setAviso("Respaldo iniciado. Aparecerá como correcto en el historial cuando termine.");
      await cargar();
    } catch (err) {
      setError(err.message);
      await cargar();
    } finally {
      setEjecutando(false);
    }
  };

  const respaldos = useMemo(() => historial.filter((r) => r.tipo === "respaldo" || r.tipo === "restauracion"), [historial]);
  const respaldosExitosos = historial.filter((r) => r.tipo === "respaldo" && r.estado === "exitoso" && r.rutaExportacion);
  const ultimoExitoso = respaldosExitosos[0] || null;
  const espacio = respaldosExitosos.reduce((s, r) => s + (r.tamanoBytes || 0), 0);

  const historialFiltrado = respaldos.filter((r) => {
    if (tabHistorial === "correctos" && r.estado !== "exitoso") return false;
    if (tabHistorial === "errores" && r.estado !== "fallido") return false;
    if (tabHistorial === "automaticos" && !(r.tipo === "respaldo" && r.iniciadoPor === "sistema")) return false;
    if (tabHistorial === "manuales" && !(r.tipo === "respaldo" && r.iniciadoPor !== "sistema")) return false;
    const t = busqueda.trim().toLowerCase();
    return !t || `${r.bucketDestino} ${r.iniciadoPor} ${tipoVisible(r)} ${r.errorMensaje || ""}`.toLowerCase().includes(t);
  });

  if (cargando) {
    return <div className="py-16 text-center text-slate-400 text-xs">Cargando respaldos...</div>;
  }

  if (!config) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error || "No se pudo cargar la configuración de respaldos."} />
      </div>
    );
  }

  const kpis = [
    {
      key: "estado", titulo: "Respaldo automático", icono: Power,
      valor: configServidor?.habilitado ? "Activo" : "Inactivo",
      detalle: configServidor?.habilitado ? `Cada ${configServidor.intervaloDias} días` : "No hay respaldos programados",
    },
    {
      key: "ultimo", titulo: "Último respaldo", icono: History,
      valor: ultimoExitoso ? fechaHora(ultimoExitoso.fechaFin || ultimoExitoso.fechaInicio) : "Sin respaldos",
      detalle: ultimoExitoso ? `${formatoTamano(ultimoExitoso.tamanoBytes)} · Correcto` : "Aún no hay un respaldo correcto",
    },
    {
      key: "proximo", titulo: "Próximo respaldo", icono: CalendarClock,
      valor: configServidor?.habilitado ? fechaHora(configServidor.proximaEjecucion) : "—",
      detalle: configServidor?.habilitado ? `Hora ${configServidor.horaEjecucion} (Chile)` : "Activa el respaldo automático",
    },
    {
      key: "espacio", titulo: "Espacio de respaldos", icono: HardDrive,
      valor: formatoTamano(espacio),
      detalle: `${respaldosExitosos.length} respaldo(s) correctos registrados`,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Respaldo de Base de Datos"
        icon={DatabaseBackup}
        subtitle="Exportación e importación nativa de Firestore hacia un bucket de Google Cloud Storage."
        loading={cargando}
        onRefresh={() => { setError(null); setAviso(null); cargar(); }}
      />

      <ErrorBanner message={error} />
      {aviso && (
        <div className="p-3 rounded-xl bg-sage-lighter border border-sage-light text-sage-darker text-xs font-semibold">{aviso}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpis.map(({ key, titulo, icono: Icono, valor, detalle }) => (
          <div key={key} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card">
            <div className="w-11 h-11 rounded-xl bg-primary-lighter text-primary-dark flex items-center justify-center mb-4">
              <Icono className="w-5 h-5" />
            </div>
            <p className="text-lg font-black text-carbon-dark tracking-tight">{valor}</p>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">{titulo}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{detalle}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <Tarjeta icono={ShieldCheck} titulo="Configuración de respaldos">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-carbon-dark">Respaldos automáticos</p>
                <p className="text-[11px] text-slate-400">Firebase programa la ejecución; no hay que configurar un Cloud Scheduler.</p>
              </div>
              <Interruptor activo={Boolean(config.habilitado)} onChange={(v) => cambiar("habilitado", v)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Frecuencia (cada N días)</label>
                <input type="number" min="1" value={config.intervaloDias} onChange={(e) => cambiar("intervaloDias", e.target.value)} className={CLASE_CAMPO} />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5"><Clock className="w-3.5 h-3.5 text-slate-400" /> Hora de ejecución (Chile)</label>
                <input type="time" value={config.horaEjecucion} onChange={(e) => cambiar("horaEjecucion", e.target.value)} className={CLASE_CAMPO} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Destino del respaldo (Google Cloud Storage)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.bucketDestino || ""}
                  onChange={(e) => cambiar("bucketDestino", e.target.value)}
                  placeholder="gs://mi-bucket/respaldos"
                  className={`${CLASE_CAMPO} ${destinoValido ? "" : "border-red-400 bg-red-50/30"}`}
                />
                <ActionButton onClick={probarAcceso} busy={probando} busyLabel="Probando..." disabled={!config.bucketDestino || !destinoValido}>
                  Probar acceso
                </ActionButton>
              </div>
              {!destinoValido && <p className="text-xs text-red-500 mt-1">Formato inválido: usa gs://bucket/carpeta (no una ruta de servidor).</p>}
              <p className="text-[11px] text-slate-400 mt-1">
                Requisito manual, una sola vez: el bucket debe existir y la cuenta de servicio de Cloud Functions necesita el rol
                &quot;Cloud Datastore Import Export Admin&quot; sobre él. &quot;Probar acceso&quot; escribe y borra un archivo real en la carpeta.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
              <p className="text-xs font-bold text-carbon-dark">Conservación</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Mantener respaldos durante (días)</label>
                  <input type="number" min="1" value={config.retencionDias} onChange={(e) => cambiar("retencionDias", e.target.value)} className={CLASE_CAMPO} />
                </div>
                <div className="flex items-center justify-between gap-3 pb-2">
                  <span className="text-xs font-semibold text-gray-700">Eliminar automáticamente respaldos antiguos</span>
                  <Interruptor activo={Boolean(config.eliminarAntiguos)} onChange={(v) => cambiar("eliminarAntiguos", v)} />
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Se aplica como una regla de ciclo de vida del bucket, limitada a la carpeta de respaldos: es configuración de infraestructura,
                la aplicación no borra archivos uno por uno. Requiere indicar una carpeta en el destino.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
              <ActionButton icon={Play} onClick={ejecutarAhora} busy={ejecutando} busyLabel="Iniciando..." disabled={!configServidor?.bucketDestino}>
                Ejecutar respaldo ahora
              </ActionButton>
              <ActionButton variant="primary" onClick={guardar} busy={guardando} busyLabel="Guardando...">
                Guardar configuración
              </ActionButton>
            </div>
          </Tarjeta>
        </div>

        <Tarjeta icono={RotateCcw} titulo="Restaurar">
          <p className="text-xs text-slate-500">Restaura la base de datos desde un respaldo existente. No se admite subir archivos.</p>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Restaurar desde un respaldo existente</label>
            <select value={origenRestaurar} onChange={(e) => setOrigenRestaurar(e.target.value)} className={CLASE_CAMPO}>
              <option value="">Seleccione un respaldo...</option>
              {respaldosExitosos.map((r) => (
                <option key={r.id} value={r.id}>
                  {fechaHora(r.fechaFin || r.fechaInicio)} · {r.iniciadoPor === "sistema" ? "Automático" : "Manual"} · {formatoTamano(r.tamanoBytes)}
                </option>
              ))}
            </select>
            {respaldosExitosos.length === 0 && <p className="text-[11px] text-slate-400 mt-1">Todavía no hay respaldos correctos.</p>}
          </div>
          <ActionButton
            variant="primary"
            icon={RotateCcw}
            disabled={!origenRestaurar}
            onClick={() => setRestauracion(respaldosExitosos.find((r) => r.id === origenRestaurar))}
          >
            Restaurar...
          </ActionButton>
        </Tarjeta>
      </div>

      <Tarjeta icono={History} titulo="Historial de respaldos">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {[["todos", "Todos"], ["correctos", "Correctos"], ["errores", "Errores"], ["automaticos", "Automáticos"], ["manuales", "Manuales"]].map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setTabHistorial(valor)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${tabHistorial === valor ? "bg-white text-carbon-dark shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {etiqueta}
              </button>
            ))}
          </div>
          <input
            type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar..."
            className="w-56 px-3.5 py-2 bg-gray-50/50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 pr-3">Fecha y hora</th>
                <th className="py-2.5 pr-3">Tipo</th>
                <th className="py-2.5 pr-3">Estado</th>
                <th className="py-2.5 pr-3">Tamaño</th>
                <th className="py-2.5 pr-3">Duración</th>
                <th className="py-2.5 pr-3">Ubicación</th>
                <th className="py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historialFiltrado.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">Sin registros.</td></tr>
              ) : historialFiltrado.map((r) => (
                <tr key={r.id}>
                  <td className="py-3 pr-3 font-medium text-slate-700 whitespace-nowrap">{fechaHora(r.fechaInicio)}</td>
                  <td className="py-3 pr-3 text-slate-600">{tipoVisible(r)}</td>
                  <td className="py-3 pr-3">
                    <InsigniaEstado estado={r.estado} />
                    {r.errorMensaje && <p className="text-[10px] text-red-600 mt-1 max-w-xs">{r.errorMensaje}</p>}
                  </td>
                  <td className="py-3 pr-3 text-slate-600">{r.tipo === "respaldo" ? formatoTamano(r.tamanoBytes) : "—"}</td>
                  <td className="py-3 pr-3 text-slate-600">{duracion(r)}</td>
                  <td className="py-3 pr-3 text-slate-500 font-mono text-[11px] max-w-[16rem] truncate" title={r.bucketDestino}>{r.bucketDestino}</td>
                  <td className="py-3 text-right">
                    {r.tipo === "respaldo" && r.estado === "exitoso" && r.rutaExportacion && (
                      <RowActionsMenu actions={[{ label: "Restaurar desde aquí", icon: RotateCcw, onClick: () => setRestauracion(r) }]} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta icono={ScrollText} titulo="Bitácora de operaciones">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 pr-3">Fecha y hora</th>
                <th className="py-2.5 pr-3">Usuario</th>
                <th className="py-2.5 pr-3">Acción</th>
                <th className="py-2.5">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historial.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-slate-400">Aún no hay operaciones registradas.</td></tr>
              ) : historial.slice(0, 30).map((r) => (
                <tr key={r.id}>
                  <td className="py-3 pr-3 text-slate-700 whitespace-nowrap">{fechaHora(r.fechaInicio)}</td>
                  <td className="py-3 pr-3 text-slate-600">{r.iniciadoPor === "sistema" ? "Sistema" : r.iniciadoPor}</td>
                  <td className="py-3 pr-3 font-semibold text-slate-700">{accionVisible(r)}</td>
                  <td className="py-3"><InsigniaEstado estado={r.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      {restauracion && (
        <ModalRestauracion
          respaldo={restauracion}
          onCerrar={() => setRestauracion(null)}
          onRestaurado={async () => {
            setRestauracion(null);
            setAviso("Restauración iniciada. Puede tardar unos minutos; el estado se actualiza en el historial.");
            await cargar();
          }}
        />
      )}
    </div>
  );
};

// Confirmación de restauración: dos salvaguardas distintas (respaldo de seguridad previo y frase exacta).
const ModalRestauracion = ({ respaldo, onCerrar, onRestaurado }) => {
  const [crearSeguridad, setCrearSeguridad] = useState(true);
  const [frase, setFrase] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    try {
      await respaldoService.restaurar(respaldo.id, { confirmacion: frase, crearRespaldoSeguridad: crearSeguridad });
      await onRestaurado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={enviando ? undefined : onCerrar}>
      <div className="bg-white rounded-2xl shadow-dropdown w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Restaurar base de datos</h3>
          <button type="button" onClick={onCerrar} disabled={enviando} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <ErrorBanner message={error} />
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Punto de restauración</p>
            <p className="font-bold text-carbon-dark">{fechaHora(respaldo.fechaFin || respaldo.fechaInicio)}</p>
            <p className="text-slate-600">
              {respaldo.iniciadoPor === "sistema" ? "Automático" : "Manual"} · {formatoTamano(respaldo.tamanoBytes)} ·{" "}
              <span className="font-bold text-sage-dark">Verificado (respaldo correcto)</span>
            </p>
            <p className="font-mono text-[11px] text-slate-400 break-all">{respaldo.rutaExportacion}</p>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Los documentos de este respaldo <b>sobrescribirán</b> a los actuales que tengan el mismo ID: los cambios hechos después del respaldo
              en esos documentos se perderán. Los documentos creados después del respaldo no se eliminan. No incluye archivos de Storage ni usuarios de
              Authentication.
            </span>
          </div>

          <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
            <input type="checkbox" checked={crearSeguridad} onChange={(e) => setCrearSeguridad(e.target.checked)} className="mt-0.5 w-4 h-4 accent-primary" />
            <span>
              <b>Crear respaldo de seguridad del estado actual antes de restaurar.</b> Si ese respaldo falla o no termina a tiempo, no se restaura nada.
            </span>
          </label>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Para continuar, escribe <span className="font-mono font-black">{FRASE_CONFIRMACION}</span>
            </label>
            <input type="text" value={frase} onChange={(e) => setFrase(e.target.value)} disabled={enviando} className={CLASE_CAMPO} autoComplete="off" />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <ActionButton disabled={enviando} onClick={onCerrar}>Cancelar</ActionButton>
            <ActionButton variant="primary" busy={enviando} busyLabel={crearSeguridad ? "Respaldando y restaurando..." : "Restaurando..."} disabled={frase !== FRASE_CONFIRMACION} onClick={confirmar}>
              Continuar con restauración
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
};
