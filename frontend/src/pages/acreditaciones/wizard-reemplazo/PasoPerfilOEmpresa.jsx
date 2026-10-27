import React, { useEffect, useState } from "react";
import { Building2, CheckCircle2, AlertTriangle } from "lucide-react";
import { participacionService } from "../../../services/participacionService";
import { empresaService } from "../../../services/empresaService";
import { perfilRecursoService } from "../../../services/perfilRecursoService";
import { ErrorBanner } from "../../../components/shared/ErrorBanner";
import { PasoPerfil } from "../wizard/PasoPerfil";
import { CrearPerfilRecurso } from "../../../components/perfiles-recurso/CrearPerfilRecurso";
import { SelectorPerfilRecurso } from "../../../components/perfiles-recurso/SelectorPerfilRecurso";

// Paso 3 del wizard de Reemplazar Acreditación. Para Empresa es el mismo
// selector de Perfil de Participación que ya usa el wizard de Nueva
// Acreditación (PasoPerfil, reutilizado tal cual). Para Persona/
// Maquinaria, la Empresa NO es seleccionable — se mueven junto con su
// Empresa actual (decisión de negocio confirmada) — así que este paso
// muestra esa Empresa de forma informativa, pide los Perfiles de Recurso (por ID; Persona uno
// o más, Maquinaria uno), y
// solo si la Empresa aún no participa en el Proyecto destino, pide
// también un Perfil de Participación para poder crear esa Participación
// + Expediente como parte del mismo reemplazo.
export const PasoPerfilOEmpresa = ({
  entidadTipo, entidadSel, proyectoSel, mandanteId,
  perfilSel, onSeleccionarPerfil,
  perfilRecursoIds = [], onCambiarPerfiles,
  onEstadoChange,
}) => {
  const esEmpresa = entidadTipo === "empresa";
  const empresaId = esEmpresa ? entidadSel?.id : entidadSel?.empresaId;

  const [empresaNombre, setEmpresaNombre] = useState(null);
  const [cargandoParticipacion, setCargandoParticipacion] = useState(!esEmpresa);
  const [participacionExistente, setParticipacionExistente] = useState(null);
  const [errorParticipacion, setErrorParticipacion] = useState(null);
  const [perfilesDisponibles, setPerfilesDisponibles] = useState([]);
  const [perfilesCargados, setPerfilesCargados] = useState(false);
  const tipoPerfil = entidadTipo === "persona" ? "persona" : "recurso";

  useEffect(() => {
    if (esEmpresa || !empresaId) return;
    empresaService
      .obtenerPorId(empresaId)
      .then((e) => setEmpresaNombre(e?.razonSocial || null))
      .catch(() => setEmpresaNombre(null));
  }, [esEmpresa, empresaId]);

  const cargarPerfiles = () => perfilRecursoService
    .listar({ mandanteId, tipo: tipoPerfil, estado: "activo" })
    .then((data) => setPerfilesDisponibles(data || []))
    .catch(() => setPerfilesDisponibles([]))
    .finally(() => setPerfilesCargados(true));

  useEffect(() => {
    if (esEmpresa || !mandanteId) return;
    cargarPerfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esEmpresa, tipoPerfil, mandanteId]);

  // Perfil creado desde este paso: se recarga la lista; si era el primero, queda elegido.
  const handlePerfilCreado = ({ id }) => {
    const eraElPrimero = perfilesDisponibles.length === 0;
    cargarPerfiles();
    if (eraElPrimero && id && perfilRecursoIds.length === 0) onCambiarPerfiles([id]);
  };

  useEffect(() => {
    if (esEmpresa || !empresaId || !proyectoSel?.id) return;
    setCargandoParticipacion(true);
    setErrorParticipacion(null);
    participacionService
      .listar({ proyectoId: proyectoSel.id, empresaId })
      .then((data) => {
        const activa = (data || []).find((p) => p.estado === "activa");
        setParticipacionExistente(activa || null);
      })
      .catch((err) =>
        setErrorParticipacion(err.message || "No se pudo verificar la Participación de la Empresa."),
      )
      .finally(() => setCargandoParticipacion(false));
  }, [esEmpresa, empresaId, proyectoSel?.id]);

  useEffect(() => {
    if (!onEstadoChange) return;
    onEstadoChange({
      necesitaPerfil: esEmpresa || (!cargandoParticipacion && !participacionExistente),
      participacionExistente,
      cargando: !esEmpresa && cargandoParticipacion,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esEmpresa, cargandoParticipacion, participacionExistente]);

  if (esEmpresa) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Selecciona el Perfil de Participación</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Define qué Requerimientos aplicarán al nuevo Expediente de esta Empresa.
          </p>
        </div>
        <PasoPerfil mandanteId={mandanteId} perfilId={perfilSel?.id} onSeleccionar={onSeleccionarPerfil} />
      </div>
    );
  }

  const etiqueta = entidadTipo === "persona" ? "La Persona" : "La Maquinaria";

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-gray-900">
          Empresa y Perfil de Recurso
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {etiqueta} se mueve junto con su Empresa actual — no es seleccionable en este flujo.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-3">
        <Building2 className="w-5 h-5 text-primary flex-shrink-0" />
        <div>
          <p className="text-xs font-bold text-carbon-dark">{empresaNombre || "Cargando..."}</p>
          <p className="text-[11px] text-slate-400">Empresa actual de {entidadSel?.nombre}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-1.5">
          <label className="block text-xs font-semibold text-gray-700">
            {entidadTipo === "persona" ? "Perfiles de Recurso en el Proyecto destino * (uno o más)" : "Perfil de Recurso en el Proyecto destino *"}
          </label>
          {perfilesDisponibles.length > 0 && (
            <CrearPerfilRecurso variante="enlace" tipo={tipoPerfil} mandanteId={mandanteId} onCreado={handlePerfilCreado} />
          )}
        </div>
        {perfilesCargados && perfilesDisponibles.length === 0 ? (
          <CrearPerfilRecurso tipo={tipoPerfil} mandanteId={mandanteId} onCreado={handlePerfilCreado} />
        ) : (
          <SelectorPerfilRecurso
            tipo={tipoPerfil}
            perfiles={perfilesDisponibles}
            valor={perfilRecursoIds}
            onChange={onCambiarPerfiles}
            mandanteId={mandanteId}
            onPerfilCreado={cargarPerfiles}
            etiqueta={entidadTipo === "persona" ? "Perfiles de Recurso" : "Perfil de Recurso"}
          />
        )}
      </div>

      {cargandoParticipacion ? (
        <p className="text-xs text-slate-400 py-4 text-center">
          Verificando la Participación de la Empresa en el Proyecto destino...
        </p>
      ) : errorParticipacion ? (
        <ErrorBanner message={errorParticipacion} />
      ) : participacionExistente ? (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-sage-lighter border border-sage-light text-sage-darker text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          La Empresa ya participa en el Proyecto destino — se usará su Expediente vigente.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            La Empresa aún no participa en el Proyecto destino: se creará su Participación y Expediente.
          </div>
          <PasoPerfil mandanteId={mandanteId} perfilId={perfilSel?.id} onSeleccionar={onSeleccionarPerfil} />
        </div>
      )}
    </div>
  );
};
