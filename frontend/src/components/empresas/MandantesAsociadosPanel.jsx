import { useEffect, useState } from "react";
import { Link2, Plus, Unlink } from "lucide-react";
import { empresaService } from "../../services/empresaService";
import { mandanteService } from "../../services/mandanteService";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { MandanteChip } from "../shared/MandanteChip";
import { ActionButton } from "../shared/ActionButton";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { ErrorBanner } from "../shared/ErrorBanner";

// Mandantes asociados a la Empresa (empresaMandantes): un vínculo por par Empresa-Mandante;
// desasociar lo deja inactivo (sin borrado). Solo superadmin y admin_comercial gestionan esta
// pestaña; el backend rechaza desasociar si la Empresa tiene Participaciones activas en
// Proyectos de ese Mandante.
export const MandantesAsociadosPanel = ({ empresaId, empresaNombre }) => {
  const [vinculos, setVinculos] = useState([]);
  const [mandantes, setMandantes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mandanteElegido, setMandanteElegido] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aDesasociar, setADesasociar] = useState(null); // vínculo pendiente de confirmar

  const cargar = () => empresaService.listarMandantes(empresaId)
    .then((data) => setVinculos(data || []))
    .catch((err) => setError(err.message || "No se pudieron cargar los Mandantes asociados."))
    .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
    mandanteService.listar("activo")
      .then((data) => setMandantes(data || []))
      .catch(() => setMandantes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const activos = new Set(vinculos.filter((v) => v.estado === "activo").map((v) => v.mandanteId));
  const disponibles = mandantes.filter((m) => !activos.has(m.id));

  const asociar = async () => {
    if (!mandanteElegido) return;
    setOcupado(true);
    setError(null);
    try {
      await empresaService.asociarMandante(empresaId, mandanteElegido);
      setMandanteElegido("");
      await cargar();
    } catch (err) {
      setError(err.message || "No se pudo asociar el Mandante.");
    } finally {
      setOcupado(false);
    }
  };

  const desasociar = async () => {
    setOcupado(true);
    setError(null);
    try {
      await empresaService.desasociarMandante(empresaId, aDesasociar.mandanteId);
      setADesasociar(null);
      await cargar();
    } catch (err) {
      setADesasociar(null);
      setError(err.message || "No se pudo desasociar el Mandante.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-6 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
        <Link2 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Mandantes asociados</h3>
      </div>

      <ErrorBanner message={error} />

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={mandanteElegido}
          onChange={(e) => setMandanteElegido(e.target.value)}
          disabled={ocupado}
          className="flex-1 min-w-[14rem] px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="">Seleccione un Mandante para asociar...</option>
          {disponibles.map((m) => (
            <option key={m.id} value={m.id}>{getMandanteDisplayName(m)}</option>
          ))}
        </select>
        <ActionButton variant="primary" icon={Plus} onClick={asociar} disabled={!mandanteElegido || ocupado}>
          Asociar
        </ActionButton>
      </div>

      {cargando ? (
        <p className="text-xs text-slate-400 py-4 text-center">Cargando...</p>
      ) : vinculos.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">La Empresa no está asociada a ningún Mandante.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {vinculos.map((v) => (
            <li key={v.mandanteId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <MandanteChip nombre={v.nombre} logoUrl={v.logoUrl} />
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  v.estado === "activo"
                    ? "bg-sage-lighter text-sage-darker border-sage-light"
                    : "bg-slate-50 text-slate-500 border-slate-200"
                }`}>
                  {v.estado === "activo" ? "Asociado" : "Desasociado"}
                </span>
              </div>
              {v.estado === "activo" && (
                <ActionButton icon={Unlink} onClick={() => setADesasociar(v)} disabled={ocupado}>
                  Desasociar
                </ActionButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {aDesasociar && (
        <ConfirmacionModal
          peligro
          titulo="¿Desasociar el Mandante?"
          mensaje={`${empresaNombre || "La Empresa"} dejará de estar asociada a ${aDesasociar.nombre}. El vínculo queda inactivo (no se borra) y puede volver a asociarse. No se permite si tiene participaciones activas en proyectos de ese Mandante.`}
          textoConfirmar="Desasociar"
          ocupado={ocupado}
          onCancelar={() => setADesasociar(null)}
          onConfirmar={desasociar}
        />
      )}
    </div>
  );
};
