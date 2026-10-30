import { useEffect, useState } from "react";
import { History, Info, Loader2, Sparkles } from "lucide-react";
import { repositorioDocumentalService } from "../../../services/repositorioDocumentalService";
import { revisionExpedienteService } from "../../../services/revisionExpedienteService";
import { ErrorBanner } from "../../shared/ErrorBanner";
import { LoteRevisionExpediente } from "./LoteRevisionExpediente";
import { PropuestasLote } from "./PropuestasLote";
import { MatrizRevision } from "./MatrizRevision";
import { RevisionesPorRequerimiento } from "./RevisionesPorRequerimiento";

// La revisión con IA (lote, propuestas y su historial) es de superadmin y evaluador.
const ROLES_REVISAN = ["superadmin", "evaluador"];

const Paso = ({ numero, titulo, children }) => (
  <section className="rounded-2xl border border-slate-100 p-5 space-y-3">
    <h4 className="flex items-center gap-2 text-sm font-bold text-carbon-dark">
      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold bg-primary text-white">{numero}</span>
      {titulo}
    </h4>
    {children}
  </section>
);

// Historial del motor anterior (revisión por carpetas con tipos documentales): solo lectura, se
// carga al abrirlo.
const HistorialAnterior = ({ expedienteId, nombreExpediente }) => {
  const [abierto, setAbierto] = useState(false);
  const [matriz, setMatriz] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!abierto || matriz) return undefined;
    let vigente = true;
    revisionExpedienteService.matriz(expedienteId)
      .then((m) => { if (vigente) setMatriz(m); })
      .catch((err) => { if (vigente) setError(err.message || "No se pudo cargar el historial."); });
    return () => { vigente = false; };
  }, [abierto, matriz, expedienteId]);
  return (
    <details onToggle={(e) => setAbierto(e.currentTarget.open)} className="rounded-2xl border border-slate-100">
      <summary className="flex items-center gap-2 px-5 py-3 cursor-pointer select-none text-sm font-bold text-slate-600">
        <History className="w-4 h-4" /> Historial del motor anterior (solo lectura)
      </summary>
      <div className="px-5 pb-5 space-y-2">
        <p className="text-[11px] text-slate-500">Resultados de la revisión por carpetas con tipos documentales, que ya no se usa en el expediente.</p>
        <ErrorBanner message={error} />
        {abierto && <MatrizRevision matriz={matriz} expedienteId={expedienteId} nombreExpediente={nombreExpediente} puedeResolver={false} />}
      </div>
    </details>
  );
};

// Pestaña "Revisiones IA" del Expediente (E5): trabaja solo con el mapeo de su Carpeta de empresa y
// las reglas de cada requerimiento. 1) revisión en lote (plan, costo estimado y ejecución) y
// 2) propuestas pendientes (confirmar en bloque o descartar). Un expediente con la configuración
// anterior no tiene revisión en lote hasta la migración (E6): se avisa y se enlaza a Documentación.
// `sujetos`: personas y maquinarias activas [{ tipo, id, nombre, apellido, patente, carpeta }].
export const RevisionIAExpediente = ({ expediente, usuarioId, rol, sujetos = [], onIrADocumentacion, onEvaluado }) => {
  const [repo, setRepo] = useState(null);
  const [error, setError] = useState(null);
  const [versionPropuestas, setVersionPropuestas] = useState(0);
  const expedienteId = expediente.id;
  const revisa = ROLES_REVISAN.includes(rol);
  const abierto = expediente.estado !== "cerrado";

  useEffect(() => {
    let vigente = true;
    repositorioDocumentalService.obtener(expedienteId)
      .then((d) => { if (vigente) setRepo(d || { origen: "ninguna" }); })
      .catch((err) => { if (vigente) setError(err.message || "No se pudo leer la carpeta del expediente."); });
    return () => { vigente = false; };
  }, [expedienteId]);

  if (!repo) {
    return error ? <ErrorBanner message={error} />
      : <p className="flex items-center gap-2 py-8 justify-center text-xs text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Cargando revisión IA...</p>;
  }
  const carpeta = repo.origen === "carpetaEmpresa" ? repo.repositorioDocumental : null;
  const local = carpeta?.tipo === "local";

  return (
    <div className="space-y-5">
      <div>
        <h3 className="flex items-center gap-2 text-base font-bold text-carbon-dark"><Sparkles className="w-4 h-4 text-primary" /> Revisiones IA</h3>
        <p className="text-xs text-slate-500">
          Revisa con IA los documentos ubicados en la Carpeta de empresa (mapeo documental y patrones aprendidos) con las reglas de cada
          requerimiento. La IA propone; el evaluador confirma.
        </p>
      </div>

      {!revisa ? (
        <p className="text-[11px] text-slate-400">Solo superadmin y evaluador revisan con IA.</p>
      ) : !carpeta ? (
        <div className="flex items-start gap-2 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>
              {repo.origen === "legado"
                ? "Este expediente usa la configuración anterior de su carpeta: la revisión en lote estará disponible al vincular su Carpeta de empresa (o tras la migración)."
                : "Este expediente aún no tiene su Carpeta de empresa vinculada: la revisión en lote la necesita."}
            </p>
            <button type="button" onClick={onIrADocumentacion} className="font-bold underline">Vincular la Carpeta de empresa en la pestaña Documentación</button>
          </div>
        </div>
      ) : (
        <>
          <Paso numero={1} titulo="Revisión en lote">
            {!abierto ? <p className="text-xs text-slate-500">El expediente está cerrado.</p>
              : !local ? <p className="text-xs text-slate-500">La Carpeta de empresa está en SharePoint: la revisión en lote por ahora lee solo carpetas locales.</p>
                : (
                  <LoteRevisionExpediente
                    expediente={expediente}
                    usuarioId={usuarioId}
                    carpeta={carpeta}
                    sujetos={sujetos}
                    onRevisado={() => setVersionPropuestas((n) => n + 1)}
                    onIrADocumentacion={onIrADocumentacion}
                  />
                )}
          </Paso>
          <Paso numero={2} titulo="Propuestas pendientes">
            <PropuestasLote
              expedienteId={expedienteId}
              version={versionPropuestas}
              puedeConfirmar={abierto}
              onConfirmado={onEvaluado}
            />
          </Paso>
        </>
      )}

      {revisa && <RevisionesPorRequerimiento key={versionPropuestas} expedienteId={expedienteId} />}
      <HistorialAnterior expedienteId={expedienteId} nombreExpediente={expediente.empresaNombre || null} />
    </div>
  );
};
