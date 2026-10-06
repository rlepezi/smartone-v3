import React from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { RecursoEdicionForm } from "../../components/recursos/RecursoEdicionForm";

// Pantalla para CREAR. Editar ya no es una ruta aparte: se hace in-place en el
// detalle (botón "Editar"), así que /recursos/:id/editar redirige allí con la
// edición activada.
export const RecursoFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  if (id) return <Navigate to={`/recursos/${id}?editar=1`} replace />;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/recursos")}
          className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Nueva Maquinaria</h2>
          <p className="text-xs text-gray-500">Registre una nueva maquinaria, vehículo o equipo.</p>
        </div>
      </div>

      <RecursoEdicionForm
        formId="recurso-form"
        onGuardado={() => navigate("/recursos")}
        onCancelar={() => navigate("/recursos")}
      />
    </div>
  );
};
