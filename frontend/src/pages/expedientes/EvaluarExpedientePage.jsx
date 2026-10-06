import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PlanillaEvaluacion } from "../../components/expedientes/PlanillaEvaluacion";

// Planilla de evaluación a pantalla completa. Toda la lógica vive en
// PlanillaEvaluacion, que también se embebe en el detalle de Proyecto.
export const EvaluarExpedientePage = () => {
  const { id, personaId, recursoId } = useParams();
  const navigate = useNavigate();
  return (
    <PlanillaEvaluacion
      expedienteId={id}
      personaId={personaId}
      recursoId={recursoId}
      onVolver={() => navigate(`/expedientes/${id}`)}
    />
  );
};
