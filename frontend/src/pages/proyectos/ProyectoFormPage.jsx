import React from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ProyectoEdicionForm } from "../../components/proyectos/ProyectoEdicionForm";

// Pantalla para CREAR un proyecto. Editar ya no es una ruta aparte: se hace
// in-place en el detalle (ProyectoDetailPage, botón "Editar"), así que
// /proyectos/:id/editar redirige allí con la edición activada.
export const ProyectoFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  if (id) return <Navigate to={`/proyectos/${id}?editar=1`} replace />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/proyectos")}
          className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Nuevo Proyecto</h2>
          <p className="text-xs text-gray-500">Registre un nuevo proyecto para un Mandante.</p>
        </div>
      </div>

      <ProyectoEdicionForm
        formId="proyecto-form"
        onGuardado={() => navigate("/proyectos")}
        onCancelar={() => navigate("/proyectos")}
      />
    </div>
  );
};
