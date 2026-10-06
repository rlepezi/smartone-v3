import { useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { ConfigurarRequerimientosPanel } from "./ConfigurarRequerimientosPanel";

// "Configurar Requerimientos" del Perfil de Participación, en un modal — abierto desde el detalle
// de Expediente ("Agregar Requerimiento") para no salir de esa pantalla. Envuelve el MISMO panel
// que usa la pantalla dedicada (ConfigurarRequerimientosPage), sin copiar su lógica. Cada cambio
// acá se propaga a TODOS los Expedientes no cerrados del Perfil (backend), no solo a este.
// `expedienteIdContexto`: cuando se abre desde un Expediente puntual, además se refresca esa
// pantalla al toque (ver ConfigurarRequerimientosPanel) — no cambia a qué Expedientes aplica.
export const ConfigurarRequerimientosModal = ({
  perfilParticipacionId, expedienteIdContexto = null, onExpedienteActualizado, onCerrar,
  nivelInicial = null,
}) => {
  const { profile } = useAuth();
  const soloLectura = ["mandante_lector", "evaluador"].includes(profile?.rol);
  const [perfil, setPerfil] = useState(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onCerrar}>
      <div
        className="bg-white rounded-2xl shadow-dropdown w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Configurar Requerimientos</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {perfil ? `Perfil: ${perfil.nombre}` : "Cargando perfil..."}
              {soloLectura && " · Solo lectura"}
              {" · "}Los cambios se aplican a todos los Expedientes abiertos de este Perfil.
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">
          <ConfigurarRequerimientosPanel
            perfilParticipacionId={perfilParticipacionId}
            expedienteIdContexto={expedienteIdContexto}
            onExpedienteActualizado={onExpedienteActualizado}
            onPerfilCargado={setPerfil}
            nivelInicial={nivelInicial}
          />
        </div>
      </div>
    </div>
  );
};
