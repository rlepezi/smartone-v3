import { useAuth } from "../../contexts/AuthContext";
import { useMandanteContexto } from "../../hooks/useMandanteContexto";
import { CampoMandante } from "../shared/CampoMandante";
import { CarpetaLocalCard } from "./CarpetaLocalCard";
import { SharePointCard } from "./SharePointCard";

// Pestaña "Fuentes documentales" (superadmin; mandante_admin solo su Mandante). Las fuentes son por
// Mandante: el superadmin con varios Mandantes elige uno; con uno solo viene preseleccionado.
export const TabFuentes = () => {
  const { profile } = useAuth();
  const contexto = useMandanteContexto();
  const { mandanteId, modo } = contexto;

  return (
    <div className="space-y-6">
      {modo === "seleccionable" && (
        <div className="max-w-sm">
          <CampoMandante contexto={contexto} conFoco={false} />
        </div>
      )}
      {modo === "ninguno" && <CampoMandante contexto={contexto} />}
      {!mandanteId ? (
        modo === "seleccionable" && <p className="py-8 text-center text-xs text-slate-400">Seleccione un Mandante para ver sus fuentes documentales.</p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <CarpetaLocalCard key={`carpeta-${mandanteId}`} usuarioId={profile?.uid} mandanteId={mandanteId} />
          <SharePointCard key={mandanteId} mandanteId={mandanteId} />
        </div>
      )}
    </div>
  );
};
