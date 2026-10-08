import { useState } from "react";
import { UserMinus } from "lucide-react";
import { personaService } from "../../services/personaService";
import { recursoService } from "../../services/recursoService";
import { ActionButton } from "./ActionButton";
import { ConfirmacionModal } from "./ConfirmacionModal";

// Acción "Terminar relación" con la Empresa actual (empresaPersonas / empresaRecursos), para el
// detalle de Persona y de Maquinaria. Pide confirmación; si el backend informa asignaciones
// activas en proyectos con esa Empresa (409 CONFIRMACION_REQUERIDA), muestra cuáles se
// finalizarán y pide una segunda confirmación explícita. Sin borrado: la relación queda con
// fecha de término y el historial se conserva.
export const TerminarRelacionAccion = ({ tipo, id, empresaNombre, onTerminada, onError }) => {
  const [paso, setPaso] = useState(null); // null | { asignaciones?: [], mensaje?: string }
  const [ocupado, setOcupado] = useState(false);
  const servicio = tipo === "persona" ? personaService : recursoService;

  const ejecutar = async (confirmado) => {
    setOcupado(true);
    try {
      await servicio.terminarRelacion(id, { confirmado });
      setPaso(null);
      onTerminada?.();
    } catch (err) {
      if (err.codigo === "CONFIRMACION_REQUERIDA") {
        setPaso({ asignaciones: err.detalle?.asignaciones || [], mensaje: err.message });
      } else {
        setPaso(null);
        onError?.(err.message || "No se pudo terminar la relación.");
      }
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <ActionButton icon={UserMinus} onClick={() => setPaso({})}>Terminar relación</ActionButton>
      {paso && !paso.asignaciones && (
        <ConfirmacionModal
          peligro
          titulo="¿Terminar la relación con la empresa?"
          mensaje={`Se terminará la relación vigente${empresaNombre ? ` con ${empresaNombre}` : ""}. El historial se conserva.`}
          textoConfirmar="Terminar relación"
          ocupado={ocupado}
          onCancelar={() => setPaso(null)}
          onConfirmar={() => ejecutar(false)}
        />
      )}
      {paso?.asignaciones && (
        <ConfirmacionModal
          peligro
          titulo="Se finalizarán asignaciones activas"
          mensaje={paso.mensaje}
          items={paso.asignaciones.map((a) => ({ key: a.participacionId, principal: a.proyectoNombre }))}
          textoConfirmar="Terminar y finalizarlas"
          ocupado={ocupado}
          onCancelar={() => setPaso(null)}
          onConfirmar={() => ejecutar(true)}
        />
      )}
    </>
  );
};
