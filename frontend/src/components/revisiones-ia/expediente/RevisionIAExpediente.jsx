import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { revisionExpedienteService } from "../../../services/revisionExpedienteService";
import { ErrorBanner } from "../../shared/ErrorBanner";
import { formatFechaHora } from "../../../utils/fechas";
import { BloqueCarpeta } from "./BloqueCarpeta";
import { BloqueRequerimientos } from "./BloqueRequerimientos";
import { MatrizRevision } from "./MatrizRevision";
import { BloqueValidar } from "./BloqueValidar";
import { RevisionesPorRequerimiento } from "./RevisionesPorRequerimiento";

const ROLES_CONFIGURAN_CATALOGO = ["superadmin", "mandante_admin"];
// Validar y aceptar crean sesiones y evaluaciones: mismos roles que operan Revisiones IA.
const ROLES_VALIDAN = ["superadmin", "evaluador"];

const Paso = ({ numero, titulo, completo, children }) => (
  <section className="rounded-2xl border border-slate-100 p-5 space-y-3">
    <h4 className="flex items-center gap-2 text-sm font-bold text-carbon-dark">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border ${completo ? "bg-sage-lighter border-sage-light text-sage-darker" : "bg-primary text-white border-primary"}`}>{numero}</span>
      {titulo}
    </h4>
    {children}
  </section>
);

// Pestaña "Revisiones IA" del Expediente: 1) carpeta de la empresa, 2) requerimientos a revisar
// con IA, 3) validar, y la matriz de estado sujeto × requerimiento. Usa el mismo motor que el
// módulo /revisiones-ia. mandante_lector la ve en solo lectura.
export const RevisionIAExpediente = ({ expediente, usuarioId, rol, onEvaluarManual }) => {
  const [datos, setDatos] = useState(null);
  const [matriz, setMatriz] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [handle, setHandle] = useState(null);
  const expedienteId = expediente.id;

  useEffect(() => {
    let vigente = true;
    Promise.all([
      revisionExpedienteService.obtenerConfig(expedienteId),
      revisionExpedienteService.matriz(expedienteId),
    ])
      .then(([config, m]) => {
        if (!vigente) return;
        setDatos(config);
        setMatriz(m);
        setError(null);
      })
      .catch((err) => { if (vigente) setError(err.message || "No se pudo cargar la revisión IA del expediente."); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [expedienteId]);

  // Tras validar o resolver: configuración (última validación) y matriz al día.
  const recargar = useCallback(async () => {
    try {
      const [config, m] = await Promise.all([
        revisionExpedienteService.obtenerConfig(expedienteId),
        revisionExpedienteService.matriz(expedienteId),
      ]);
      setDatos(config);
      setMatriz(m);
    } catch (err) {
      setError(err.message || "No se pudo actualizar la revisión IA.");
    }
  }, [expedienteId]);

  const guardar = async (cambios) => {
    const actualizado = await revisionExpedienteService.guardarConfig(expedienteId, cambios);
    setDatos(actualizado);
    if (cambios.requerimientosIA) setMatriz(await revisionExpedienteService.matriz(expedienteId));
    return actualizado;
  };

  if (cargando) {
    return <p className="flex items-center gap-2 py-8 justify-center text-xs text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Cargando revisión IA...</p>;
  }
  if (!datos) return <ErrorBanner message={error} />;

  const { config, puedeEditar, resumen } = datos;
  const carpetaLista = Boolean(handle);
  const habilitados = resumen.habilitados;
  const puedeConfigurar = ROLES_CONFIGURAN_CATALOGO.includes(rol);
  const puedeValidar = ROLES_VALIDAN.includes(rol) && expediente.estado !== "cerrado";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h3 className="flex items-center gap-2 text-base font-bold text-carbon-dark"><Sparkles className="w-4 h-4 text-primary" /> Revisiones IA</h3>
          <p className="text-xs text-slate-500">
            Revisa la carpeta de la empresa y propone evaluaciones de los requerimientos habilitados.
            {config?.ultimaValidacionAt && ` Última validación: ${formatFechaHora(config.ultimaValidacionAt)}.`}
          </p>
        </div>
        <ol className="flex items-center gap-2 text-[11px] font-semibold text-slate-500" aria-label="Pasos">
          <li className={config?.carpetaNombre ? "text-sage-dark" : "text-primary"}>1 Carpeta</li><li aria-hidden="true">→</li>
          <li className={habilitados ? "text-sage-dark" : config?.carpetaNombre ? "text-primary" : ""}>2 Requerimientos</li><li aria-hidden="true">→</li>
          <li className={carpetaLista && habilitados ? "text-primary" : ""}>3 Validar</li>
        </ol>
      </div>
      <ErrorBanner message={error} />
      {!puedeEditar && (
        <p className="text-[11px] text-slate-400">Solo lectura: no puede configurar ni validar {expediente.estado === "cerrado" ? "un expediente cerrado" : "con su rol"}.</p>
      )}

      <Paso numero={1} titulo="Carpeta del expediente" completo={Boolean(config?.carpetaNombre)}>
        <BloqueCarpeta
          expedienteId={expedienteId}
          mandanteId={expediente.mandanteId}
          usuarioId={usuarioId}
          config={config}
          empresa={datos.empresa}
          puedeEditar={puedeEditar}
          puedeConfigurarBase={puedeConfigurar}
          onGuardar={guardar}
          onAcceso={setHandle}
          carpetaExpediente={datos.carpetaExpediente || null}
        />
      </Paso>

      <Paso numero={2} titulo="Requerimientos a revisar con IA" completo={habilitados > 0}>
        <BloqueRequerimientos
          key={datos.requerimientos.map((r) => `${r.requerimientoId}:${r.habilitadoIA}:${r.elegible}`).join("|")}
          requerimientos={datos.requerimientos}
          resumen={resumen}
          puedeEditar={puedeEditar}
          puedeConfigurar={puedeConfigurar}
          onGuardar={guardar}
        />
      </Paso>

      <Paso numero={3} titulo="Validar" completo={Boolean(config?.ultimaValidacionAt)}>
        <BloqueValidar
          expediente={expediente}
          config={config}
          handle={handle}
          habilitados={habilitados}
          puedeValidar={puedeValidar}
          ultimaSesionId={config?.ultimaSesionId}
          ultimaSesion={datos.ultimaSesion}
          onTerminado={recargar}
        />
      </Paso>

      <section className="space-y-3">
        <h4 className="text-sm font-bold text-carbon-dark">Estado por sujeto y requerimiento</h4>
        <MatrizRevision
          matriz={matriz}
          expedienteId={expedienteId}
          nombreExpediente={datos.empresa?.razonSocial}
          puedeResolver={puedeValidar}
          onEvaluarManual={onEvaluarManual}
          onCambio={recargar}
        />
      </section>

      {["superadmin", "evaluador"].includes(rol) && <RevisionesPorRequerimiento expedienteId={expedienteId} />}
    </div>
  );
};
