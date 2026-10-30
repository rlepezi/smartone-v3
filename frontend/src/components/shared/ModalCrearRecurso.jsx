import React, { useEffect, useRef, useState } from "react";
import { LayoutModalDocumento } from "../expedientes/documentacion/LayoutModalDocumento";
import { recursoService } from "../../services/recursoService";
import { empresaService } from "../../services/empresaService";
import { SugerenciasChips } from "./SugerenciasChips";
import { ConfirmacionModal } from "./ConfirmacionModal";
import { SUGERENCIAS_TIPO_MAQUINARIA } from "../../utils/sugerenciasRelacionLaboral";
import { CampoIdentificacionRecurso } from "./CampoIdentificacionRecurso";
import { SelectorPerfilRecurso } from "../perfiles-recurso/SelectorPerfilRecurso";
import { perfilRecursoService } from "../../services/perfilRecursoService";
import { RequerimientosNuevoPerfilModal } from "../perfiles-recurso/RequerimientosNuevoPerfilModal";
import { errorIdentificacion, normalizarPatente } from "../../utils/identificacionRecurso";

// Mismo criterio que ModalCrearPersona.jsx, para Recurso (maquinaria).
// Sin "Tipo de Relación": la RelaciónRecurso inicial (entidad 19) se crea
// igual (recursoService.crear crea el recurso y su relación con la empresa en una transacción),
// pero acá se completa sin ese dato (decisión "completar después", mismo
// criterio ya aplicado a Persona/cargo) — queda null hasta editarse desde
// el detalle de la Maquinaria. Componente compartido: lo usan tanto
// PasoAsignaciones.jsx (wizard de Nueva Acreditación) como
// ProyectoDetailPage.jsx (alta rápida desde "Recursos Asignados").
//
// La Empresa la fija el contexto y se muestra como primer campo. Identificación obligatoria
// (patente chilena o N° de serie / código interno, ver CampoIdentificacionRecurso) y no única:
// si otra maquinaria activa visible ya la usa (409 PATENTE_DUPLICADA) se avisa y se pide
// confirmación para continuar.
// `mandanteId` (opcional): con él, la clasificación se elige como Perfil de Recurso del Mandante
// (select + "+ Nuevo perfil") y su nombre se guarda como `tipo`; `onCreada(recurso)` recibe además
// `perfilRecursoId` para dejarlo asignado. Sin Mandante (catálogo de la Empresa, que puede tener
// varios), se mantiene "Tipo de maquinaria" como texto con sugerencias.
// `inicial` (opcional): { nombre, patente } para precargar (p. ej. "Crear desde carpeta").
// `documento` (opcional): carpeta para ver el padrón o el listado al lado del formulario.
export const ModalCrearRecurso = ({ empresaId, mandanteId = null, perfilParticipacionId = null, onCreada, onCerrar, inicial = null, documento = null }) => {
  const patenteRef = useRef(null);
  const [empresaNombre, setEmpresaNombre] = useState("");
  const [patenteDuplicada, setPatenteDuplicada] = useState(null); // {recursoId, nombre, patente}
  const [formData, setFormData] = useState({
    tipoIdentificacion: "patente", patente: inicial?.patente || "", nombre: inicial?.nombre || "", tipo: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState(null);
  // Perfiles de Recurso (maquinaria) activos del Mandante y el elegido.
  const [perfiles, setPerfiles] = useState([]);
  const [perfilIds, setPerfilIds] = useState([]);
  const conPerfil = Boolean(mandanteId);
  // Perfil recién creado: desde un Expediente (`perfilParticipacionId`) se pregunta qué
  // Requerimientos le aplican.
  const [perfilNuevo, setPerfilNuevo] = useState(null);

  const cargarPerfiles = () => {
    if (!mandanteId) return;
    perfilRecursoService.listar({ mandanteId, tipo: "recurso", estado: "activo" })
      .then((data) => setPerfiles(data || []))
      .catch(() => setPerfiles([]));
  };
  useEffect(cargarPerfiles, [mandanteId]);

  useEffect(() => {
    if (!empresaId) return;
    empresaService.obtenerPorId(empresaId)
      .then((e) => setEmpresaNombre(e?.razonSocial || ""))
      .catch(() => setEmpresaNombre(""));
  }, [empresaId]);

  const elegir = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const validateForm = () => {
    const newErrors = {};
    const errorId = errorIdentificacion(formData.tipoIdentificacion, formData.patente);
    if (errorId) newErrors.patente = errorId;
    if (!formData.nombre.trim()) newErrors.nombre = "La marca / modelo es obligatoria.";
    if (conPerfil) {
      if (perfilIds.length === 0) newErrors.tipo = "Elija el Perfil de Recurso (o cree uno con «Nuevo perfil»).";
    } else if (!formData.tipo.trim()) {
      newErrors.tipo = "El tipo de maquinaria es obligatorio.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const crear = async (confirmarPatenteDuplicada) => {
    setLoading(true);
    try {
      const perfil = conPerfil ? perfiles.find((p) => p.id === perfilIds[0]) : null;
      const creado = await recursoService.crear({
        nombre: formData.nombre.trim(),
        // Con Perfil de Recurso, su nombre es la clasificación (sugiere el perfil al asignarla).
        tipo: perfil ? perfil.nombre : formData.tipo.trim(),
        empresaId,
        estado: "activo",
        tipoIdentificacion: formData.tipoIdentificacion,
        patente: formData.tipoIdentificacion === "patente" ? normalizarPatente(formData.patente) : formData.patente.trim(),
        confirmarPatenteDuplicada,
      });
      setPatenteDuplicada(null);
      onCreada(perfil ? { ...creado, perfilRecursoId: perfil.id } : creado);
    } catch (err) {
      if (err.codigo === "PATENTE_DUPLICADA") {
        setPatenteDuplicada(err.detalle || {});
      } else {
        setPatenteDuplicada(null);
        setServerError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    if (!validateForm()) return;
    await crear(false);
  };

  return (
    <>
      <LayoutModalDocumento
        titulo="Nueva Maquinaria"
        onCerrar={onCerrar}
        documento={documento}
        nombreBuscado={formData.nombre}
        campoFocoRef={patenteRef}
      >
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {serverError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs">{serverError}</div>
          )}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Empresa</label>
              <input
                type="text" value={empresaNombre} disabled
                className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed"
              />
              <p className="text-[11px] text-slate-400 mt-1">La Maquinaria se crea con su relación con esta Empresa.</p>
            </div>
            <CampoIdentificacionRecurso
              inputRef={patenteRef}
              tipo={formData.tipoIdentificacion}
              valor={formData.patente}
              onCambiarTipo={(v) => elegir("tipoIdentificacion", v)}
              onCambiarValor={(v) => elegir("patente", v)}
              error={errors.patente}
            />
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Marca / Modelo *</label>
              <input
                type="text" name="nombre" value={formData.nombre} onChange={handleChange}
                placeholder="Ej: Caterpillar 320"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                  errors.nombre ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.nombre && <p className="text-xs text-red-500 mt-1">{errors.nombre}</p>}
            </div>
            {conPerfil ? (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Perfil de Recurso *</label>
                <SelectorPerfilRecurso
                  tipo="recurso"
                  perfiles={perfiles}
                  valor={perfilIds}
                  onChange={(ids) => { setPerfilIds(ids); if (errors.tipo) setErrors((prev) => ({ ...prev, tipo: null })); }}
                  mandanteId={mandanteId}
                  onPerfilCreado={(perfil) => {
                    cargarPerfiles();
                    if (perfilParticipacionId && perfil?.id && !perfil.existente && !perfil.reactivado) {
                      setPerfilNuevo({ id: perfil.id, nombre: perfil.nombre, tipo: "recurso" });
                    }
                  }}
                  error={errors.tipo}
                  anchoCompleto
                />
                <p className="text-[11px] text-slate-400 mt-1">Queda asignado al ingresarla a un proyecto de este Mandante.</p>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de maquinaria *</label>
                <input
                  type="text" name="tipo" value={formData.tipo} onChange={handleChange}
                  placeholder="Ej: Camioneta"
                  className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                    errors.tipo ? "border-red-400 bg-red-50/30" : "border-gray-200"
                  }`}
                />
                {errors.tipo && <p className="text-xs text-red-500 mt-1">{errors.tipo}</p>}
                <p className="text-[11px] text-slate-400 mt-1">Se usa para sugerir la clasificación al asignarla a un proyecto.</p>
                <SugerenciasChips opciones={SUGERENCIAS_TIPO_MAQUINARIA} valor={formData.tipo} onElegir={(v) => elegir("tipo", v)} />
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onCerrar} className="px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all">
              Cancelar
            </button>
            <button
              type="submit" disabled={loading}
              className="px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all disabled:opacity-50"
            >
              {loading ? "Creando..." : "Crear Maquinaria"}
            </button>
          </div>
        </form>
      </LayoutModalDocumento>
      {perfilNuevo && (
        <RequerimientosNuevoPerfilModal
          perfilParticipacionId={perfilParticipacionId}
          perfil={perfilNuevo}
          onCerrar={() => setPerfilNuevo(null)}
        />
      )}
      {patenteDuplicada && (
        <ConfirmacionModal
          peligro
          titulo="Patente ya registrada"
          mensaje={`La patente ${patenteDuplicada.patente || formData.patente.trim()} ya la usa otra maquinaria activa: ${patenteDuplicada.nombre || "sin nombre"}. La patente no es única; puede continuar si corresponde.`}
          textoConfirmar="Crear de todas formas"
          ocupado={loading}
          onCancelar={() => setPatenteDuplicada(null)}
          onConfirmar={() => crear(true)}
        />
      )}
    </>
  );
};
