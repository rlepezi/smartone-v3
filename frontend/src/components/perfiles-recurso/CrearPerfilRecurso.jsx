import { Link } from "react-router-dom";
import { Tags } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { puedeCrearPerfilRecurso } from "../../utils/permisosPerfilRecurso";

const TEXTO_VACIO = {
  persona: "Este Mandante no tiene Perfiles de Recurso para personas",
  recurso: "Este Mandante no tiene Perfiles de Recurso para maquinarias",
};

// Mandante sin Perfiles de Recurso de ese tipo, donde se eligen al asignar (asistente de Nueva
// Acreditación, Ingresar recurso, Cambiar Proyecto, Reemplazar Acreditación, Requerimiento). Los
// perfiles se crean SOLO en el módulo Perfiles de Recurso: aquí se avisa y, con permiso, se enlaza a
// ese módulo (en otra pestaña, para no perder lo que se está haciendo). Las variantes "enlace",
// "boton" y "pill" (crear desde la fila) ya no dibujan nada.
export const CrearPerfilRecurso = ({ variante = "vacio", tipo }) => {
  const { profile } = useAuth();
  const puedeCrear = puedeCrearPerfilRecurso(profile?.rol);
  if (variante !== "vacio") return null;

  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
      <Tags className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
      <div className="space-y-1 min-w-0">
        <p className="text-[11px] font-semibold text-amber-800">{TEXTO_VACIO[tipo]}</p>
        {puedeCrear ? (
          <p className="text-[11px] text-amber-700">
            Créalo en el módulo{" "}
            <Link to="/perfiles-recurso" target="_blank" rel="noopener noreferrer" className="font-bold underline">Perfiles de Recurso</Link>
            {" "}y vuelve a esta pantalla.
          </p>
        ) : (
          <p className="text-[11px] text-amber-700">Pide a un administrador que cree un Perfil de Recurso para continuar.</p>
        )}
      </div>
    </div>
  );
};
