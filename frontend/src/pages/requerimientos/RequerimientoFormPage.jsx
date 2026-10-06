import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ClipboardCheck, ArrowLeft, AlertCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { requerimientoService, TIPOS_ENTIDAD, NOMBRE_CORTO_MAX } from "../../services/requerimientoService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { perfilRequerimientoService } from "../../services/perfilRequerimientoService";
import { VinculosPerfilesSection } from "../../components/requerimientos/VinculosPerfilesSection";
import { claveAplicaA } from "../../utils/claveAplicaA";

const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

// "Aplica a" guardado de un Perfil de Participación: null ("Todos") o los perfilRecursoId de sus
// vínculos activos con este Requerimiento.
const valorDeVinculos = (vinculos) => (
  vinculos.some((v) => !v.perfilRecursoId) ? null : vinculos.map((v) => v.perfilRecursoId)
);

export const RequerimientoFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { profile } = useAuth();
  const esEdicion = Boolean(id);
  const puedeEscribir = ROLES_ESCRITURA.includes(profile?.rol);

  const [formData, setFormData] = useState({
    nombre: "",
    nombreCorto: "",
    descripcion: "",
    tipoEntidad: TIPOS_ENTIDAD[0]?.value || "",
    estado: "activo",
    requiereVencimiento: false,
    esDocumentoIdentidad: false,
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [cargandoRegistro, setCargandoRegistro] = useState(esEdicion);
  const [serverError, setServerError] = useState(null);

  // Al volver (Cancelar, flecha, o después de guardar) hay que quedar en la MISMA pestaña
  // (Empresa/Persona/Maquinaria) del listado a la que pertenece este Requerimiento — nunca
  // resetear siempre a la primera pestaña. RequerimientosListPage.jsx lee este state para
  // inicializar su `activeTab`; sin él (ej. si se entró por URL directa), usa su propio default.
  const volverAlListado = () => navigate("/requerimientos", { state: { nivelActivo: formData.tipoEntidad } });

  // Vínculos Perfil-Requerimiento. `vinculosActivos`: los guardados; `seleccion`: Perfiles de
  // Participación marcados; `aplicaA`: por Mandante, null ("Todos") o perfilRecursoId — vale para
  // todos los Perfiles marcados de ese Mandante. Los cambios se aplican al guardar, en un solo
  // llamado (perfilRequerimientoService.sincronizar).
  const [perfilesPP, setPerfilesPP] = useState([]);
  const [vinculosActivos, setVinculosActivos] = useState([]);
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [aplicaA, setAplicaA] = useState({});
  // Si el Requerimiento ya se creó pero los vínculos fallaron, un reintento no debe crearlo de nuevo.
  const [creadoId, setCreadoId] = useState(null);
  const [vinculosCargados, setVinculosCargados] = useState(!esEdicion);

  useEffect(() => {
    perfilParticipacionService.listar({})
      .then((data) => setPerfilesPP(data || []))
      .catch((err) => console.error("Error al cargar perfiles de participación:", err));
  }, []);

  useEffect(() => {
    if (!esEdicion) return;
    requerimientoService
      .obtenerPorId(id)
      .then((data) => {
        setFormData({
          nombre: data.nombre || "",
          nombreCorto: data.nombreCorto || "",
          descripcion: data.descripcion || "",
          tipoEntidad: data.tipoEntidad || TIPOS_ENTIDAD[0]?.value || "",
          estado: data.estado || "activo",
          requiereVencimiento: Boolean(data.requiereVencimiento),
          esDocumentoIdentidad: Boolean(data.esDocumentoIdentidad),
        });
      })
      .catch((err) => setServerError(err.message || "No se pudo cargar el requerimiento."))
      .finally(() => setCargandoRegistro(false));
  }, [id, esEdicion]);

  useEffect(() => {
    if (!esEdicion) return;
    perfilRequerimientoService
      .listar({})
      .then((data) => {
        const activos = (data || []).filter((v) => v.requerimientoId === id && v.estado === "activo");
        setVinculosActivos(activos);
        setSeleccion(new Set(activos.map((v) => v.perfilParticipacionId)));
        // "Aplica a" inicial de cada Mandante: el de su primer Perfil vinculado (si sus vínculos no
        // son uniformes, el Mandante queda bloqueado y este valor no se usa).
        const inicial = {};
        activos.forEach((v) => {
          if (v.mandanteId in inicial) return;
          inicial[v.mandanteId] = valorDeVinculos(
            activos.filter((x) => x.perfilParticipacionId === v.perfilParticipacionId),
          );
        });
        setAplicaA(inicial);
      })
      .catch((err) => console.error("Error al cargar los vínculos del requerimiento:", err))
      .finally(() => setVinculosCargados(true));
  }, [id, esEdicion]);

  const ppPorId = Object.fromEntries(perfilesPP.map((p) => [p.id, p]));
  const vinculosPorPP = vinculosActivos.reduce((acc, v) => {
    (acc[v.perfilParticipacionId] ||= []).push(v);
    return acc;
  }, {});
  const claveActual = (ppId) => (vinculosPorPP[ppId] ? claveAplicaA(valorDeVinculos(vinculosPorPP[ppId])) : null);

  // Un Mandante cuyos vínculos guardados no son un producto uniforme (sus Perfiles de Participación
  // activos no aplican a los mismos Perfiles de Recurso) no se puede representar con un solo
  // "Aplica a": se bloquea su edición aquí para no reescribirlos ni perder información.
  const clavesPorMandante = {};
  Object.keys(vinculosPorPP).forEach((ppId) => {
    const pp = ppPorId[ppId];
    if (!pp || pp.estado !== "activo") return;
    (clavesPorMandante[pp.mandanteId] ||= new Set()).add(claveActual(ppId));
  });
  const mandantesBloqueados = new Set(
    Object.keys(clavesPorMandante).filter((m) => clavesPorMandante[m].size > 1),
  );

  const tieneVinculos = vinculosActivos.length > 0;
  // El tipo no se puede cambiar si el Requerimiento ya está vinculado (el backend también lo impide).
  const tipoBloqueado = esEdicion && tieneVinculos;

  // Regla: mínimo 1 Perfil de Participación. Al crear siempre se exige; al editar solo si ya tenía
  // alguno — un Requerimiento antiguo con cero vínculos sigue siendo editable, con aviso.
  const vinculoObligatorio = !esEdicion || tieneVinculos;
  const faltaVinculo = vinculoObligatorio && seleccion.size < 1;
  const MENSAJE_VINCULO = "Selecciona al menos un Perfil de Participación antes de guardar.";
  const avisoSinVinculos = esEdicion && vinculosCargados && !tieneVinculos && seleccion.size === 0
    ? "Este Requerimiento no tiene ningún Perfil de Participación vinculado — considera seleccionar al menos uno."
    : null;

  const valorAplicaA = (mandanteId) => (formData.tipoEntidad === "empresa" ? null : (aplicaA[mandanteId] ?? null));

  // Cantidad de vínculos (combinaciones Perfil de Participación × Perfil de Recurso) por Mandante.
  const conteoPorMandante = {};
  seleccion.forEach((ppId) => {
    const pp = ppPorId[ppId];
    if (!pp) return;
    const n = mandantesBloqueados.has(pp.mandanteId)
      ? (vinculosPorPP[ppId]?.length || 0)
      : (valorAplicaA(pp.mandanteId)?.length || 1);
    conteoPorMandante[pp.mandanteId] = (conteoPorMandante[pp.mandanteId] || 0) + n;
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const nuevoValor = type === "checkbox" ? checked : value;
    setFormData((prev) => ({
      ...prev,
      [name]: nuevoValor,
      // esDocumentoIdentidad solo tiene sentido para Persona.
      ...(name === "tipoEntidad" && value !== "persona" ? { esDocumentoIdentidad: false } : {}),
    }));
    // Los Perfiles de Recurso elegidos son de un tipo: al cambiarlo vuelven a "Todos".
    if (name === "tipoEntidad") setAplicaA({});
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const alternarPP = (ppId) => {
    setSeleccion((prev) => {
      const n = new Set(prev);
      if (n.has(ppId)) n.delete(ppId); else n.add(ppId);
      return n;
    });
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.nombre.trim()) newErrors.nombre = "El nombre es obligatorio.";
    const corto = formData.nombreCorto.trim();
    if (!corto) newErrors.nombreCorto = "El nombre corto es obligatorio.";
    else if (corto.length > NOMBRE_CORTO_MAX) newErrors.nombreCorto = `Máximo ${NOMBRE_CORTO_MAX} caracteres.`;
    if (!formData.tipoEntidad) newErrors.tipoEntidad = "El nivel de aplicación es obligatorio.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Estado deseado por Perfil de Participación que difiere de lo guardado. Se omiten los Perfiles
  // inactivos y los de Mandantes bloqueados: sus vínculos quedan tal cual.
  const calcularCambios = (requerimientoId) => {
    const cambios = [];
    const ppIds = new Set([...Object.keys(vinculosPorPP), ...seleccion]);
    ppIds.forEach((ppId) => {
      const pp = ppPorId[ppId];
      if (!pp || pp.estado !== "activo" || mandantesBloqueados.has(pp.mandanteId)) return;
      const activo = seleccion.has(ppId);
      const valor = valorAplicaA(pp.mandanteId);
      const deseada = activo ? claveAplicaA(valor) : null;
      if (deseada === claveActual(ppId)) return;
      cambios.push({ perfilParticipacionId: ppId, requerimientoId, activo, perfilRecursoIds: activo ? valor : null });
    });
    return cambios;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    if (!validateForm()) return;

    if (faltaVinculo) {
      setServerError(MENSAJE_VINCULO);
      return;
    }

    const payload = {
      nombre: formData.nombre.trim(),
      nombreCorto: formData.nombreCorto.trim(),
      descripcion: formData.descripcion.trim() || null,
      tipoEntidad: formData.tipoEntidad,
      estado: formData.estado,
      requiereVencimiento: formData.requiereVencimiento,
      esDocumentoIdentidad: formData.tipoEntidad === "persona" && formData.esDocumentoIdentidad,
    };

    if (formData.estado === "inactivo" && calcularCambios(id || creadoId || "nuevo").some((c) => c.activo)) {
      setServerError("Solo se puede vincular un Requerimiento activo a Perfiles: cambia el Estado a Activo o quita los vínculos nuevos.");
      return;
    }

    setLoading(true);
    let requerimientoId = id || creadoId;
    try {
      if (requerimientoId) {
        await requerimientoService.actualizar(requerimientoId, payload);
      } else {
        const creado = await requerimientoService.crear(payload);
        requerimientoId = creado?.id;
        setCreadoId(requerimientoId);
      }
    } catch (err) {
      setServerError(err.message);
      setLoading(false);
      return;
    }

    // Vínculos: un solo llamado con el estado final; el backend escribe todo en un batch y
    // sincroniza una vez los Expedientes abiertos de cada Perfil afectado.
    const cambios = calcularCambios(requerimientoId);
    if (cambios.length > 0) {
      try {
        await perfilRequerimientoService.sincronizar(cambios);
      } catch (err) {
        setServerError(`El Requerimiento se guardó, pero los vínculos no: ${err.message}. Corrige y vuelve a guardar.`);
        setLoading(false);
        return;
      }
    }
    setLoading(false);
    volverAlListado();
  };

  if (cargandoRegistro) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-slate-400 text-xs">
        Cargando requerimiento...
      </div>
    );
  }

  const camposValidos = formData.nombre.trim() && formData.nombreCorto.trim()
    && formData.nombreCorto.trim().length <= NOMBRE_CORTO_MAX && formData.tipoEntidad;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header de página */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={volverAlListado}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              {esEdicion ? "Editar Requerimiento" : "Nuevo Requerimiento"}
            </h2>
            <p className="text-xs text-gray-500">
              {esEdicion
                ? puedeEscribir
                  ? "Modifique los datos del requerimiento."
                  : "Detalle del requerimiento (solo lectura)."
                : "Registre una nueva condición documental evaluable."}
            </p>
          </div>
        </div>
      </div>

      {serverError && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Primero la vinculación (Mandante → Perfiles → Aplica a); después los datos. */}
        {puedeEscribir && (
          <VinculosPerfilesSection
            perfiles={perfilesPP}
            tipoEntidad={formData.tipoEntidad}
            seleccion={seleccion}
            onAlternar={alternarPP}
            aplicaA={aplicaA}
            onCambiarAplicaA={(mandanteId, valor) => setAplicaA((prev) => ({ ...prev, [mandanteId]: valor }))}
            mandantesBloqueados={mandantesBloqueados}
            conteoPorMandante={conteoPorMandante}
            mandanteInicial={vinculosActivos.map((v) => ppPorId[v.perfilParticipacionId])
              .find((p) => p?.estado === "activo")?.mandanteId || ""}
            obligatoria={vinculoObligatorio}
            mensaje={faltaVinculo ? MENSAJE_VINCULO : null}
            aviso={avisoSinVinculos}
          />
        )}

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <ClipboardCheck className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Datos del Requerimiento</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nombre *</label>
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Ej: Licencia de conducir clase D vigente"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.nombre ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.nombre && <p className="text-xs text-red-500 mt-1">{errors.nombre}</p>}
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nombre corto *</label>
              <input
                type="text"
                name="nombreCorto"
                value={formData.nombreCorto}
                onChange={handleChange}
                disabled={!puedeEscribir}
                maxLength={NOMBRE_CORTO_MAX}
                placeholder="Ej: Licencia clase D"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.nombreCorto ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              <div className="flex justify-between mt-1">
                {errors.nombreCorto
                  ? <p className="text-xs text-red-500">{errors.nombreCorto}</p>
                  : <p className="text-[11px] text-slate-400">Se muestra en listados y planillas.</p>}
                <p className="text-[11px] text-slate-400">{formData.nombreCorto.length}/{NOMBRE_CORTO_MAX}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nivel de Aplicación *</label>
              <select
                name="tipoEntidad"
                value={formData.tipoEntidad}
                onChange={handleChange}
                disabled={!puedeEscribir || tipoBloqueado}
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.tipoEntidad ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              >
                {TIPOS_ENTIDAD.map((n) => (
                  <option key={n.value} value={n.value}>{n.label}</option>
                ))}
              </select>
              {tipoBloqueado && puedeEscribir && (
                <p className="text-[11px] text-slate-400 mt-1">
                  No se puede cambiar: el Requerimiento ya está vinculado a Perfiles de Participación.
                </p>
              )}
              {errors.tipoEntidad && <p className="text-xs text-red-500 mt-1">{errors.tipoEntidad}</p>}
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="requiereVencimiento"
                name="requiereVencimiento"
                checked={formData.requiereVencimiento}
                onChange={handleChange}
                disabled={!puedeEscribir}
                className="w-4 h-4 accent-primary disabled:cursor-not-allowed"
              />
              <label htmlFor="requiereVencimiento" className="text-xs font-semibold text-gray-700">
                Requiere fecha de vencimiento
              </label>
            </div>

            {formData.tipoEntidad === "persona" && (
              <div className="md:col-span-2 flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <input
                  type="checkbox"
                  id="esDocumentoIdentidad"
                  name="esDocumentoIdentidad"
                  checked={formData.esDocumentoIdentidad}
                  onChange={handleChange}
                  disabled={!puedeEscribir}
                  className="w-4 h-4 mt-0.5 accent-primary disabled:cursor-not-allowed"
                />
                <label htmlFor="esDocumentoIdentidad" className="text-xs text-gray-700">
                  <span className="font-semibold">Es un documento de identidad</span> (cédula, licencia de conducir, etc.)
                  <span className="block text-[11px] text-slate-400 mt-0.5">
                    Si se anonimiza a la Persona, la Evidencia de este Requerimiento se elimina físicamente tras un periodo de gracia.
                  </span>
                </label>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Estado</label>
              <select
                name="estado"
                value={formData.estado}
                onChange={handleChange}
                disabled={!puedeEscribir}
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Descripción</label>
              <textarea
                name="descripcion"
                value={formData.descripcion}
                onChange={handleChange}
                disabled={!puedeEscribir}
                rows={3}
                placeholder="Descripción opcional del requerimiento..."
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={volverAlListado}
            className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-sm"
          >
            {puedeEscribir ? "Cancelar" : "Volver"}
          </button>
          {puedeEscribir && (
            <button
              type="submit"
              disabled={loading || faltaVinculo || !vinculosCargados || !camposValidos}
              title={faltaVinculo ? MENSAJE_VINCULO : undefined}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Guardar Requerimiento"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
