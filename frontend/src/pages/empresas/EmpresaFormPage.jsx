import React from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { EmpresaEdicionForm } from "../../components/empresas/EmpresaEdicionForm";

// Pantalla para CREAR. Editar ya no es una ruta aparte: se hace in-place en el
// detalle (botón "Editar"), así que /empresas/:id/editar redirige allí con la
// edición activada.
export const EmpresaFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  if (id) return <Navigate to={`/empresas/${id}?editar=1`} replace />;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/empresas")}
          className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Nueva Empresa</h2>
          <p className="text-xs text-gray-500">Registre una nueva empresa contratista en el catálogo.</p>
        </div>
      </div>

      <EmpresaEdicionForm
        formId="empresa-form"
        onGuardado={() => navigate("/empresas")}
        onCancelar={() => navigate("/empresas")}
      />
    </div>
  );
};
