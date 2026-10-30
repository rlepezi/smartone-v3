import React, { useEffect, useState } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { empresaService } from "../../services/empresaService";
import { proyectoService } from "../../services/proyectoService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { participacionService } from "../../services/participacionService";
import { expedienteService } from "../../services/expedienteService";
import { SelectConBusqueda } from "./SelectConBusqueda";
import { hoyISO } from "../../utils/fechas";
import { DateInput } from "../ui/DateInput";

const ESTADOS_PROYECTO_NO_ELEGIBLES = ["finalizado", "archivado"];

const claseCampo = (error) =>
  `w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 ${
    error ? "border-red-400 bg-red-50/30" : "border-gray-200"
  }`;

// Modal corto "Nueva Participación": vincula una Empresa a un Proyecto con un Perfil de
// Participación. Único componente para el listado de Participaciones, Empresa Detalle
// (empresaId fijo) y Proyecto Detalle (proyectoId fijo). No hay lógica de negocio propia:
// crea la Participación y luego el Expediente con los mismos servicios que el wizard, y el
// backend calcula ahí los Requerimientos y aplica la reutilización documental.
// Personas/Maquinarias se agregan después desde el Detalle (pestaña Recursos) o con el wizard.
export const NuevaParticipacionModal = ({ empresaId = null, proyectoId = null, onCreada, onCerrar }) => {
  const [empresas, setEmpresas] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [perfiles, setPerfiles] = useState([]);
  const [formData, setFormData] = useState({
    empresaId: empresaId || "", proyectoId: proyectoId || "", perfilParticipacionId: "", fechaInicio: hoyISO(),
  });
  const [errors, setErrors] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [serverError, setServerError] = useState(null);
  // Si la Participación se creó pero el Expediente falló, un reintento solo repite el Expediente.
  const [participacionCreadaId, setParticipacionCreadaId] = useState(null);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    empresaService.listar("activo").then((d) => setEmpresas(d || [])).catch((e) => console.error(e));
    proyectoService.listar({}).then((d) => setProyectos(d || [])).catch((e) => console.error(e));
  }, []);

  const proyectoSel = proyectos.find((p) => p.id === formData.proyectoId) || null;
  const mandanteId = proyectoSel?.mandanteId || null;

  useEffect(() => {
    if (!mandanteId) return undefined;
    let vigente = true;
    perfilParticipacionService.listar({ mandanteId, estado: "activo" })
      .then((d) => { if (vigente) setPerfiles(d || []); })
      .catch((e) => console.error(e));
    return () => { vigente = false; };
  }, [mandanteId]);

  const handleChange = (e) => cambiar(e.target.name, e.target.value);

  const cambiar = (name, value) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      // El Perfil depende del Mandante del Proyecto: cambiar de Proyecto lo invalida.
      ...(name === "proyectoId" ? { perfilParticipacionId: "" } : {}),
    }));
    if (name === "proyectoId") setPerfiles([]);
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const validar = () => {
    const errs = {};
    if (!formData.empresaId) errs.empresaId = "Debe seleccionar una Empresa.";
    if (!formData.proyectoId) errs.proyectoId = "Debe seleccionar un Proyecto.";
    if (!formData.perfilParticipacionId) errs.perfilParticipacionId = "Debe seleccionar un Perfil.";
    if (!formData.fechaInicio) errs.fechaInicio = "La fecha de inicio es obligatoria.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    if (!validar()) return;
    setGuardando(true);
    let participacionId = participacionCreadaId;
    try {
      if (!participacionId) {
        const participacion = await participacionService.crear({
          proyectoId: formData.proyectoId,
          empresaId: formData.empresaId,
          perfilParticipacionId: formData.perfilParticipacionId,
          fechaInicio: formData.fechaInicio,
        });
        participacionId = participacion.id;
        setParticipacionCreadaId(participacionId);
      }
      const expediente = await expedienteService.crear({ participacionId });
      setResultado({ participacionId, expedienteId: expediente?.id || null });
    } catch (err) {
      console.error("Error al crear la Participación:", err);
      setServerError(
        participacionId
          ? `La Participación se creó, pero el Expediente falló: ${err.message || "error desconocido"}. Reintenta para completarlo.`
          : err.message || "No se pudo crear la Participación.",
      );
    } finally {
      setGuardando(false);
    }
  };

  const bloqueado = Boolean(participacionCreadaId);
  const proyectosElegibles = proyectos.filter(
    (p) => p.id === proyectoId || !ESTADOS_PROYECTO_NO_ELEGIBLES.includes(p.estado),
  );

  if (resultado) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => onCreada(resultado)}>
        <div className="bg-white rounded-2xl shadow-dropdown w-full max-w-md p-6 text-center space-y-4" onClick={(e) => e.stopPropagation()}>
          <div className="w-12 h-12 rounded-2xl bg-sage-lighter text-sage-darker flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-carbon-dark">Participación creada</h3>
            <p className="text-xs text-slate-500 mt-1">
              Se calcularon los Requerimientos y se reutilizó la documentación vigente cuando correspondía.
              Agrega Personas y Maquinarias desde el Detalle de la Empresa o del Proyecto.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCreada(resultado)}
            className="w-full px-5 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all"
          >
            Listo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={guardando ? undefined : onCerrar}>
      <div className="bg-white rounded-2xl shadow-dropdown w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Nueva Participación</h3>
          <button type="button" onClick={onCerrar} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {serverError && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs">{serverError}</div>}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Empresa *</label>
            <SelectConBusqueda
              bloque
              conAvatar
              invalido={Boolean(errors.empresaId)}
              disabled={Boolean(empresaId) || bloqueado}
              value={formData.empresaId}
              onChange={(v) => cambiar("empresaId", v)}
              textoVacio="Seleccione una Empresa..."
              placeholder="Buscar empresa..."
              options={[{ value: "", label: "Seleccione una Empresa..." }, ...empresas.map((e) => ({ value: e.id, label: e.razonSocial, logoUrl: e.logoUrl || null }))]}
            />
            {errors.empresaId && <p className="text-xs text-red-500 mt-1">{errors.empresaId}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Proyecto *</label>
            <SelectConBusqueda
              bloque
              invalido={Boolean(errors.proyectoId)}
              disabled={Boolean(proyectoId) || bloqueado}
              value={formData.proyectoId}
              onChange={(v) => cambiar("proyectoId", v)}
              textoVacio="Seleccione un Proyecto..."
              placeholder="Buscar proyecto..."
              options={[{ value: "", label: "Seleccione un Proyecto..." }, ...proyectosElegibles.map((p) => ({ value: p.id, label: `${p.nombre} (${p.codigo})` }))]}
            />
            {errors.proyectoId && <p className="text-xs text-red-500 mt-1">{errors.proyectoId}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Perfil de Participación *</label>
            <select name="perfilParticipacionId" value={formData.perfilParticipacionId} onChange={handleChange} disabled={!proyectoSel || bloqueado} className={claseCampo(errors.perfilParticipacionId)}>
              <option value="">{proyectoSel ? "Seleccione un Perfil..." : "Seleccione primero un Proyecto"}</option>
              {perfiles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            {errors.perfilParticipacionId && <p className="text-xs text-red-500 mt-1">{errors.perfilParticipacionId}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Fecha de inicio *</label>
            <DateInput name="fechaInicio" value={formData.fechaInicio} onChange={handleChange} disabled={bloqueado} className={claseCampo(errors.fechaInicio)} />
            {errors.fechaInicio && <p className="text-xs text-red-500 mt-1">{errors.fechaInicio}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onCerrar} disabled={guardando} className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className="px-5 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all disabled:opacity-60">
              {guardando ? "Creando..." : participacionCreadaId ? "Reintentar Expediente" : "Crear Participación"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
