import React, { useEffect, useState } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { acreditacionService } from "../../services/acreditacionService";
import { proyectoService } from "../../services/proyectoService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { perfilRecursoService } from "../../services/perfilRecursoService";
import { ConfirmacionModal } from "./ConfirmacionModal";
import { CrearPerfilRecurso } from "../perfiles-recurso/CrearPerfilRecurso";
import { SelectorPerfilRecurso } from "../perfiles-recurso/SelectorPerfilRecurso";
import { hoyISO } from "../../utils/fechas";
import { DateInput } from "../ui/DateInput";

// Modal "Cambiar Proyecto" / "Asignar a Proyecto" — compartido entre
// Persona y Recurso (parametrizado por `entidadTipo`, en vez de dos
// componentes casi idénticos) y entre PersonaDetailPage.jsx/
// PersonaFormPage.jsx y RecursoDetailPage.jsx/RecursoFormPage.jsx.
// Llama al endpoint corto correspondiente de acreditacionService, que
// reutiliza toda la lógica de "Reemplazar Acreditación" (RN-064, motor de
// reutilización documental) sin reimplementarla acá.
//
// El campo Rol solo existe para `entidadTipo: "persona"`, y solo se pide
// cuando la Persona no tiene ninguna Asignación activa de la que
// heredarlo. Los Perfiles de Recurso (por ID) se eligen siempre entre los
// activos del Mandante del Proyecto destino: Persona uno o más, Maquinaria
// uno (la clasificación descriptiva del Recurso solo lo preselecciona).
export const CambiarProyectoModal = ({ entidadTipo, entidadId, tieneParticipacionActiva, onCambiado, onCerrar }) => {
  const esPersona = entidadTipo === "persona";

  const [proyectos, setProyectos] = useState([]);
  const [perfilesOpciones, setPerfilesOpciones] = useState([]);
  const [perfilesRecursoOpciones, setPerfilesRecursoOpciones] = useState([]);
  // Mandante cuyos Perfiles de Recurso ya se cargaron (el aviso de "sin perfiles" espera a la carga).
  const [perfilesRecursoDe, setPerfilesRecursoDe] = useState(null);
  const [formData, setFormData] = useState({
    proyectoDestinoId: "", perfilParticipacionId: "", perfilRecursoIds: [], fechaInicio: hoyISO(),
  });
  const [errors, setErrors] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [resultado, setResultado] = useState(null);
  // 409 CONFIRMACION_REQUERIDA: asignaciones que se finalizarán y/o Expediente nuevo de la
  // Empresa en el Proyecto destino, pendientes de confirmar.
  const [afectados, setAfectados] = useState(null);
  const [nuevoExpediente, setNuevoExpediente] = useState(null);

  useEffect(() => {
    proyectoService.listar({})
      .then((data) => setProyectos(data || []))
      .catch((err) => console.error("Error al cargar proyectos:", err));
  }, []);

  const proyectoSeleccionado = proyectos.find((p) => p.id === formData.proyectoDestinoId) || null;

  useEffect(() => {
    if (!proyectoSeleccionado?.mandanteId) {
      setPerfilesOpciones([]);
      setPerfilesRecursoOpciones([]);
      return;
    }
    const mandanteId = proyectoSeleccionado.mandanteId;
    perfilParticipacionService.listar({ mandanteId, estado: "activo" })
      .then((data) => setPerfilesOpciones(data || []))
      .catch((err) => console.error("Error al cargar perfiles de participación:", err));

    cargarPerfilesRecurso(mandanteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoSeleccionado?.mandanteId, esPersona]);

  const tipoPerfil = esPersona ? "persona" : "recurso";
  function cargarPerfilesRecurso(mandanteId) {
    return perfilRecursoService.listar({ mandanteId, tipo: tipoPerfil, estado: "activo" })
      .then((data) => setPerfilesRecursoOpciones(data || []))
      .catch((err) => console.error("Error al cargar perfiles de recurso:", err))
      .finally(() => setPerfilesRecursoDe(mandanteId));
  }

  // Perfil creado desde este modal: se recarga la lista; si era el primero, queda elegido.
  const handlePerfilCreado = ({ id }) => {
    const eraElPrimero = perfilesRecursoOpciones.length === 0;
    cargarPerfilesRecurso(proyectoSeleccionado.mandanteId);
    if (eraElPrimero && id) {
      setFormData((prev) => (prev.perfilRecursoIds.length ? prev : { ...prev, perfilRecursoIds: [id] }));
      setErrors((prev) => ({ ...prev, perfilRecursoIds: null }));
    }
  };
  const perfilesRecursoListos = Boolean(proyectoSeleccionado) && perfilesRecursoDe === proyectoSeleccionado.mandanteId;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      // Cambiar de Proyecto invalida los perfiles ya elegidos — podrían
      // ser de otro Mandante.
      ...(name === "proyectoDestinoId" ? { perfilParticipacionId: "", perfilRecursoIds: [] } : {}),
    }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const validar = () => {
    const errs = {};
    if (!formData.proyectoDestinoId) errs.proyectoDestinoId = "Debe seleccionar un Proyecto.";
    if (formData.perfilRecursoIds.length === 0) errs.perfilRecursoIds = "Debe seleccionar el Perfil de Recurso.";
    if (!formData.fechaInicio) errs.fechaInicio = "La fecha de inicio es obligatoria.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const enviar = async (confirmado) => {
    setGuardando(true);
    try {
      const payload = {
        proyectoDestinoId: formData.proyectoDestinoId,
        perfilParticipacionId: formData.perfilParticipacionId || undefined,
        perfilRecursoIds: formData.perfilRecursoIds,
        fechaInicio: formData.fechaInicio,
        confirmado,
      };
      const data = esPersona ?
        await acreditacionService.cambiarProyectoPersona(entidadId, payload) :
        await acreditacionService.cambiarProyectoRecurso(entidadId, payload);
      setAfectados(null);
      setResultado(data);
    } catch (err) {
      if (err.codigo === "CONFIRMACION_REQUERIDA") {
        setAfectados(err.detalle?.afectados || []);
        setNuevoExpediente(err.detalle?.nuevoExpediente || null);
      } else {
        console.error("Error al cambiar el Proyecto:", err);
        setAfectados(null);
        setNuevoExpediente(null);
        setServerError(err.message || "No se pudo cambiar el Proyecto.");
      }
    } finally {
      setGuardando(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    if (!validar()) return;
    await enviar(false);
  };

  const etiquetaEntidad = esPersona ? "esta Persona" : "esta Maquinaria";
  const titulo = tieneParticipacionActiva ? "Cambiar Proyecto" : "Asignar a Proyecto";

  if (resultado) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => onCambiado(resultado)}>
        <div
          className="bg-white rounded-2xl shadow-dropdown w-full max-w-md p-6 text-center space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-12 h-12 rounded-2xl bg-sage-lighter text-sage-darker flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-carbon-dark">Proyecto actualizado</h3>
            <p className="text-xs text-slate-500 mt-1">
              {resultado.requerimientosTotal > 0
                ? `${resultado.requerimientosReutilizados} de ${resultado.requerimientosTotal} Requerimientos quedaron pre-cumplidos por reutilización de documentación vigente.`
                : "Se reutilizará documentación vigente cuando corresponda."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCambiado(resultado)}
            className="w-full px-5 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all"
          >
            Listo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onCerrar}>
      <div
        className="bg-white rounded-2xl shadow-dropdown w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">{titulo}</h3>
          <button type="button" onClick={onCerrar} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {serverError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs">{serverError}</div>
          )}
          <p className="text-xs text-slate-500">
            {tieneParticipacionActiva
              ? `Esto cierra la Asignación activa actual y crea una nueva en el Proyecto destino, reutilizando su documentación vigente. La Empresa se mantiene (la actual de ${etiquetaEntidad}).`
              : `Crea la primera Asignación de ${etiquetaEntidad} a un Proyecto, bajo su Empresa actual.`}
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Proyecto Destino *</label>
            <select
              name="proyectoDestinoId"
              value={formData.proyectoDestinoId}
              onChange={handleChange}
              className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                errors.proyectoDestinoId ? "border-red-400 bg-red-50/30" : "border-gray-200"
              }`}
            >
              <option value="">Seleccione un Proyecto...</option>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>
              ))}
            </select>
            {errors.proyectoDestinoId && <p className="text-xs text-red-500 mt-1">{errors.proyectoDestinoId}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="block text-xs font-semibold text-gray-700">
                {esPersona ? "Perfiles de Recurso * (uno o más)" : "Perfil de Recurso *"}
              </label>
            </div>
            {!proyectoSeleccionado ? (
              <p className="text-[11px] text-slate-400">Seleccione primero un Proyecto.</p>
            ) : perfilesRecursoListos && perfilesRecursoOpciones.length === 0 ? (
              <CrearPerfilRecurso tipo={tipoPerfil} mandanteId={proyectoSeleccionado.mandanteId} onCreado={handlePerfilCreado} />
            ) : (
              <SelectorPerfilRecurso
                tipo={tipoPerfil}
                perfiles={perfilesRecursoOpciones}
                valor={formData.perfilRecursoIds}
                onChange={(ids) => {
                  setFormData((prev) => ({ ...prev, perfilRecursoIds: ids }));
                  setErrors((prev) => ({ ...prev, perfilRecursoIds: null }));
                }}
                mandanteId={proyectoSeleccionado.mandanteId}
                onPerfilCreado={() => cargarPerfilesRecurso(proyectoSeleccionado.mandanteId)}
                error={errors.perfilRecursoIds || null}
                anchoCompleto
                etiqueta={esPersona ? "Perfiles de Recurso" : "Perfil de Recurso"}
              />
            )}
            {errors.perfilRecursoIds && <p className="text-xs text-red-500 mt-1">{errors.perfilRecursoIds}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Perfil de Participación {!tieneParticipacionActiva && "(solo si la Empresa aún no participa en este Proyecto)"}
            </label>
            <select
              name="perfilParticipacionId"
              value={formData.perfilParticipacionId}
              onChange={handleChange}
              disabled={!proyectoSeleccionado}
              className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-400"
            >
              {!proyectoSeleccionado ? (
                <option value="">Seleccione primero un Proyecto</option>
              ) : (
                <>
                  <option value="">Sin especificar</option>
                  {perfilesOpciones.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </>
              )}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Obligatorio solo si la Empresa de {etiquetaEntidad} todavía no tiene una Participación activa en el Proyecto elegido.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Fecha de Inicio *</label>
            <DateInput
              name="fechaInicio" value={formData.fechaInicio} onChange={handleChange}
              className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                errors.fechaInicio ? "border-red-400 bg-red-50/30" : "border-gray-200"
              }`}
            />
            {errors.fechaInicio && <p className="text-xs text-red-500 mt-1">{errors.fechaInicio}</p>}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onCerrar} className="px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Confirmar"}
            </button>
          </div>
        </form>
      </div>
      {afectados && (
        <ConfirmacionModal
          peligro
          titulo={afectados.length > 0 ? "Se finalizarán asignaciones vigentes" : "Se creará un Expediente nuevo"}
          mensaje={afectados.length > 0
            ? `Para continuar con ${proyectoSeleccionado?.nombre || "el Proyecto destino"} se finalizarán las siguientes asignaciones. Revise la lista y confirme.`
            : null}
          items={afectados.map((a) => ({
            key: `${a.tipo}-${a.id}-${a.proyectoId}`,
            principal: a.nombre,
            secundario: `Empresa actual: ${a.empresaNombre || "—"} · Proyecto: ${a.proyectoNombre || "—"}`,
          }))}
          textoConfirmar="Confirmar cambio"
          ocupado={guardando}
          onCancelar={() => { setAfectados(null); setNuevoExpediente(null); }}
          onConfirmar={() => enviar(true)}
        >
          {nuevoExpediente && (
            <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <strong>{nuevoExpediente.empresaNombre || "La Empresa"}</strong>{" "}
              {nuevoExpediente.creaParticipacion
                ? "no participa en "
                : "no tiene un Expediente abierto en "}
              <strong>{nuevoExpediente.proyectoNombre || "el Proyecto destino"}</strong>
              {nuevoExpediente.creaParticipacion
                ? ": se creará su Participación y un Expediente nuevo."
                : ": se creará un Expediente nuevo."}
              {" "}Si {etiquetaEntidad} debía sumarse al Expediente de otra Empresa, use primero &quot;Cambiar empresa&quot;.
            </p>
          )}
        </ConfirmacionModal>
      )}
    </div>
  );
};
