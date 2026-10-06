import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { ConfigurarRequerimientosPanel } from "../../components/perfiles-participacion/ConfigurarRequerimientosPanel";

export const ConfigurarRequerimientosPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const soloLectura = ["mandante_lector", "evaluador"].includes(profile?.rol);
  const [perfil, setPerfil] = useState(null);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header de página */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/perfiles-participacion")}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              Configurar Requerimientos
            </h2>
            <p className="text-xs text-gray-500">
              {perfil ? `Perfil: ${perfil.nombre}` : "Cargando perfil..."}
              {soloLectura && " · Solo lectura"}
              {" · "}Los cambios se aplican a todos los Expedientes abiertos de este Perfil.
            </p>
          </div>
        </div>
      </div>

      <ConfigurarRequerimientosPanel perfilParticipacionId={id} onPerfilCargado={setPerfil} />
    </div>
  );
};
