import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { PerfilRecursoFormulario } from "../../components/perfiles-recurso/PerfilRecursoFormulario";

const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];
const volverA = "/perfiles-recurso";

export const PerfilRecursoFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { profile } = useAuth();
  const esEdicion = Boolean(id);
  const puedeEscribir = ROLES_ESCRITURA.includes(profile?.rol);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(volverA)}
          className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">
            {esEdicion ? "Editar Perfil de Recurso" : "Nuevo Perfil de Recurso"}
          </h2>
          <p className="text-xs text-gray-500">
            {esEdicion
              ? puedeEscribir
                ? "Modifique los datos del perfil."
                : "Detalle del perfil (solo lectura)."
              : "Defina un nuevo Rol de Persona o Clasificación de Maquinaria para un Mandante."}
          </p>
        </div>
      </div>

      <PerfilRecursoFormulario
        id={id}
        onCancelar={() => navigate(volverA)}
        onGuardado={({ id: perfilId, creado }) => (
          creado ? navigate(volverA, { state: { nuevoId: perfilId } }) : navigate(volverA)
        )}
      />
    </div>
  );
};
