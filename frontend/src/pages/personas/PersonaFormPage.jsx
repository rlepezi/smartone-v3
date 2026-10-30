import React from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PersonaEdicionForm } from "../../components/personas/PersonaEdicionForm";

// Pantalla para CREAR. Editar ya no es una ruta aparte: se hace in-place en el
// detalle (botón "Editar"), así que /personas/:id/editar redirige allí con la
// edición activada.
export const PersonaFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  // Prellenado opcional (?rut=&nombre=&apellido=), p. ej. desde Revisiones IA.
  const [params] = useSearchParams();
  const valoresIniciales = {
    rut: params.get("rut") || "", nombre: params.get("nombre") || "", apellido: params.get("apellido") || "",
  };

  if (id) return <Navigate to={`/personas/${id}?editar=1`} replace />;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/personas")}
          className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Nueva Persona</h2>
          <p className="text-xs text-gray-500">Registre una nueva persona y su relación laboral inicial con una Empresa.</p>
        </div>
      </div>

      <PersonaEdicionForm
        formId="persona-form"
        valoresIniciales={valoresIniciales}
        onGuardado={() => navigate("/personas")}
        onCancelar={() => navigate("/personas")}
      />
    </div>
  );
};
