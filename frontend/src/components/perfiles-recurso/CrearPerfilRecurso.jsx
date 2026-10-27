import { useState } from "react";
import { Plus, Tags } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { NuevoPerfilRecursoModal } from "./NuevoPerfilRecursoModal";
import { puedeCrearPerfilRecurso } from "../../utils/permisosPerfilRecurso";

const TEXTO_VACIO = {
  persona: "Este Mandante no tiene Perfiles de Recurso para personas",
  recurso: "Este Mandante no tiene Perfiles de Recurso para maquinarias",
};

// Crear un Perfil de Recurso desde donde se elige al asignar (asistente de Nueva Acreditación,
// Ingresar recurso, Cambiar Proyecto, Reemplazar Acreditación). Único componente para todos:
//   - variante "vacio": aviso del Mandante sin perfiles de ese tipo, con el botón "Crear Perfil de
//     Recurso" (o, sin permiso, el pedido de que lo cree un administrador). Va una vez por sección.
//   - variante "enlace": "+ Crear perfil", discreto, junto al título cuando ya hay perfiles.
//   - variantes "boton" y "pill": "+ Nuevo perfil" junto al selector de una fila (botón para el
//     select de Maquinaria, pill al final de las pills de Persona). Sin permiso no se dibujan.
// Abre NuevoPerfilRecursoModal con el Mandante y la Clasificación (`tipo`: "persona" | "recurso")
// fijos; al guardar llama a `onCreado({ id, nombre, tipo })` para que quien lo usa recargue su lista.
export const CrearPerfilRecurso = ({ variante = "vacio", tipo, mandanteId, onCreado }) => {
  const { profile } = useAuth();
  const puedeCrear = puedeCrearPerfilRecurso(profile?.rol);
  const [abierto, setAbierto] = useState(false);

  // `reactivado` / `existente`: el perfil no se creó; se reactivó uno inactivo o se eligió uno
  // que ya existía con ese nombre. Para quien lo usa es igual: queda disponible y asignado.
  const alGuardar = ({ id, nombre, reactivado = false, existente = false }) => {
    setAbierto(false);
    onCreado?.({ id, nombre, tipo, reactivado, existente });
  };

  const modal = abierto && (
    <NuevoPerfilRecursoModal
      fijo
      inicial={{ mandanteId, tipo }}
      onGuardado={alGuardar}
      onCerrar={() => setAbierto(false)}
    />
  );

  if (variante === "boton" || variante === "pill") {
    if (!puedeCrear || !mandanteId) return null;
    const clase = variante === "pill"
      ? "px-2.5 py-1 rounded-full text-[10px]"
      : "px-2.5 py-1.5 rounded-lg text-[11px]";
    return (
      <>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          title={`Crear un Perfil de Recurso de ${tipo === "persona" ? "persona" : "maquinaria"}`}
          className={`inline-flex items-center gap-1 ${clase} font-semibold border border-dashed border-primary/50 text-primary bg-white hover:bg-primary-lighter transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
        >
          <Plus className="w-3 h-3" />
          Nuevo perfil
        </button>
        {modal}
      </>
    );
  }

  if (variante === "enlace") {
    if (!puedeCrear || !mandanteId) return null;
    return (
      <>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-dark hover:underline"
        >
          <Plus className="w-3 h-3" />
          Crear perfil
        </button>
        {modal}
      </>
    );
  }

  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
      <Tags className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
      <div className="space-y-2 min-w-0">
        <p className="text-[11px] font-semibold text-amber-800">{TEXTO_VACIO[tipo]}</p>
        {puedeCrear && mandanteId ? (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-primary/20 bg-primary-lighter hover:bg-primary/10 text-primary text-[11px] font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Crear Perfil de Recurso
          </button>
        ) : (
          <p className="text-[11px] text-amber-700">Pide a un administrador que cree un Perfil de Recurso para continuar.</p>
        )}
      </div>
      {modal}
    </div>
  );
};
