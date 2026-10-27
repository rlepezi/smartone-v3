import React, { useState } from "react";
import {
  CheckCircle2, Loader2, AlertCircle, Building2, FolderKanban, IdCard, Users, Truck, X, ArrowRightLeft, Info, FolderOpen,
} from "lucide-react";
import { formatRutDisplay } from "../../../utils/rutFormatters";
import { nombresPerfiles } from "../../../services/participacionSujetoService";
import { usePerfilesRecurso } from "../../../hooks/usePerfilesRecurso";
import { etiquetaTipoEntidad } from "../../../services/requerimientoService";
import { CLASE_RESALTADO, REF_FECHA_INICIO } from "../asistenteNavegacion";
import { DateInput } from "../../../components/ui/DateInput";
import { textoRepositorio } from "../../../utils/repositorioDocumental";

const ItemProgreso = ({ estado, label }) => {
  // estado: "pendiente" | "en_curso" | "hecho" | "error"
  const Icono = estado === "hecho" ? CheckCircle2 : estado === "en_curso" ? Loader2 : estado === "error" ? AlertCircle : null;
  const color = estado === "hecho" ? "text-sage-dark" : estado === "en_curso" ? "text-primary" : estado === "error" ? "text-red-600" : "text-slate-300";
  return (
    <div className="flex items-center gap-2 text-xs font-semibold">
      {Icono ? (
        <Icono className={`w-4 h-4 ${color} ${estado === "en_curso" ? "animate-spin" : ""}`} />
      ) : (
        <div className="w-4 h-4 rounded-full border-2 border-slate-200" />
      )}
      <span className={estado === "pendiente" ? "text-slate-400" : "text-carbon-dark"}>{label}</span>
    </div>
  );
};

const Tarjeta = ({ titulo, children, accion }) => (
  <div className="p-5 rounded-2xl border border-slate-100 bg-white space-y-3">
    <div className="flex items-center justify-between gap-3">
      <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">{titulo}</h4>
      {accion}
    </div>
    {children}
  </div>
);

const LinkEditar = ({ onClick }) => (
  onClick ? (
    <button type="button" onClick={onClick} className="text-[11px] font-bold text-primary hover:text-primary-dark">
      Editar
    </button>
  ) : null
);

const FichaDato = ({ icon: Icon, etiqueta, valor, secundario, onEditar }) => (
  <div className="flex items-start gap-3">
    <Icon className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{etiqueta}</p>
      <p className="text-sm font-bold text-carbon-dark truncate">{valor || "—"}</p>
      {secundario && <p className="text-[11px] text-slate-500 font-mono">{secundario}</p>}
    </div>
    <LinkEditar onClick={onEditar} />
  </div>
);

// Modal liviano de solo lectura para los "Ver detalle".
const DetalleModal = ({ titulo, onCerrar, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onCerrar}>
    <div className="bg-white rounded-2xl shadow-dropdown w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between p-5 border-b border-slate-100">
        <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">{titulo}</h3>
        <button type="button" onClick={onCerrar} className="text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-5 space-y-3">{children}</div>
    </div>
  </div>
);

// Paso "Confirmación" (id 7, ver AcreditacionWizardPage): revisión y confirmación. Solo lectura
// hasta el diálogo final: los conteos salen de los mismos datos ya calculados en los pasos previos
// (selección de Personas y Maquinarias, `preview` de Requerimientos, requisitos del Perfil). No
// recalcula nada por su cuenta. `onIrAPaso` recibe el id interno del paso (2 Empresa … 5 Asignaciones).
export const PasoResumen = ({
  empresaSel, proyectoSel, perfilSel, seleccion,
  fechaInicio, onFechaInicioChange, preview, requisitosPerfil,
  ejecutando, progreso, errorEjecucion, onConfirmar, onIrAPaso, problemas = [], onCorregir, repositorio = null,
}) => {
  const [detalle, setDetalle] = useState(null); // "personas" | "maquinarias" | "traslados" | "requisitos"
  const [confirmando, setConfirmando] = useState(false);
  const perfilesPorId = usePerfilesRecurso();

  const personas = seleccion.filter((s) => s.tipo === "persona");
  const recursos = seleccion.filter((s) => s.tipo === "recurso");
  const trasladados = seleccion.filter(
    (s) => s.participacionActiva && s.participacionActiva.proyectoId !== proyectoSel?.id,
  );

  const totalReq = preview?.total?.total ?? null;
  const cubiertos = preview?.total?.reutilizables ?? 0;
  const pendientes = totalReq === null ? 0 : totalReq - cubiertos;
  const pct = totalReq > 0 ? Math.round((cubiertos / totalReq) * 100) : 0;

  const yaHayProgreso = Boolean(progreso?.participacionId);
  // Los "Editar" solo tienen sentido antes de crear algo.
  const editar = (paso) => (yaHayProgreso ? undefined : () => onIrAPaso(paso));

  const estadoParticipacion = progreso?.participacionId ? "hecho" : ejecutando && !errorEjecucion ? "en_curso" : errorEjecucion?.paso === "participacion" ? "error" : "pendiente";
  const estadoAsignaciones = seleccion.length === 0 ? "hecho" :
    progreso?.sujetosListo ? "hecho" :
    errorEjecucion?.paso === "sujetos" ? "error" :
    (progreso?.participacionId && ejecutando) ? "en_curso" : "pendiente";
  const estadoExpediente = progreso?.expedienteId ? "hecho" : errorEjecucion?.paso === "expediente" ? "error" : (progreso?.sujetosListo || (progreso?.participacionId && seleccion.length === 0)) && ejecutando ? "en_curso" : "pendiente";

  const handleCrear = () => {
    // Un reintento (ya se creó algo) continúa directo; la primera vez pide confirmación final.
    if (yaHayProgreso) onConfirmar();
    else setConfirmando(true);
  };

  const filaEntidad = (e) => (
    <li key={`${e.tipo}-${e.id}`} className="flex items-center justify-between gap-3 text-xs border-b border-slate-100 last:border-0 pb-2 last:pb-0">
      <span className="font-semibold text-carbon-dark">
        {e.nombre}
        {(e.perfilRecursoIds || []).length > 0 && (
          <span className="text-slate-500 font-normal"> — {nombresPerfiles(e.perfilRecursoIds, perfilesPorId)}</span>
        )}
      </span>
      {e.participacionActiva && e.participacionActiva.proyectoId !== proyectoSel?.id ? (
        <span className="text-[10px] font-bold text-amber-700 whitespace-nowrap">Desde {e.participacionActiva.proyectoNombre}</span>
      ) : (
        <span className="text-[10px] font-bold text-sage-dark whitespace-nowrap">Disponible</span>
      )}
    </li>
  );

  const tarjetaAsignacion = (titulo, icon, lista, clave, avisoVacio) => {
    const Icon = icon;
    return (
      <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-400" />
          <p className="text-xs font-bold text-carbon-dark">{titulo}</p>
          <span className="ml-auto text-lg font-black text-carbon-dark">{lista.length}</span>
        </div>
        {lista.length === 0 ? (
          <p className="text-[11px] text-slate-400">{avisoVacio}</p>
        ) : (
          <>
            <ul className="text-[11px] text-slate-600 space-y-0.5">
              {lista.slice(0, 3).map((e) => <li key={e.id} className="truncate">{e.nombre}</li>)}
              {lista.length > 3 && <li className="text-slate-400">+{lista.length - 3} más</li>}
            </ul>
            <button type="button" onClick={() => setDetalle(clave)} className="text-[11px] font-bold text-primary hover:text-primary-dark">
              Ver detalle →
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Resumen y confirmación</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Revisa los datos de la acreditación, las asignaciones y el estado documental antes de crearla.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-sage-lighter text-sage-darker border border-sage-light">5 pasos completados</span>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            {yaHayProgreso ? "En proceso" : "Revisión pendiente"}
          </span>
        </div>
      </div>

      {pendientes > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            La acreditación se creará con {pendientes} {pendientes === 1 ? "requisito pendiente" : "requisitos pendientes"}.
            Podrás completarlos posteriormente desde el expediente.
          </span>
        </div>
      )}

      {/* Bloque 1 — Datos de la acreditación */}
      <Tarjeta titulo="Datos de la acreditación">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FichaDato icon={Building2} etiqueta="Empresa" valor={empresaSel?.razonSocial} secundario={empresaSel?.rut ? formatRutDisplay(empresaSel.rut) : null} onEditar={editar(2)} />
          <FichaDato icon={FolderKanban} etiqueta="Proyecto" valor={proyectoSel?.nombre} secundario={proyectoSel?.codigo} onEditar={editar(3)} />
          <FichaDato icon={IdCard} etiqueta="Perfil de Participación" valor={perfilSel?.nombre} onEditar={editar(4)} />
        </div>
        <div className="pt-3 border-t border-slate-100 flex items-start gap-3">
          <FolderOpen className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Documentación</p>
            {repositorio ? (
              <p className="text-sm font-bold text-carbon-dark truncate">
                {textoRepositorio(repositorio)}
                {repositorio.tipo === "sharepoint" && repositorio.url && (
                  <a href={repositorio.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-[11px] font-bold text-primary hover:underline">Abrir</a>
                )}
              </p>
            ) : (
              <>
                <p className="text-sm font-medium italic text-slate-400">Sin vincular</p>
                <p className="text-[11px] text-slate-500">Podrás vincularla después desde el expediente.</p>
              </>
            )}
          </div>
          <LinkEditar onClick={editar(2)} />
        </div>
        <div className="pt-3 border-t border-slate-100">
          <label className="block text-xs font-semibold text-gray-700 mb-1">Fecha de inicio *</label>
          <p className="text-[11px] text-slate-500 mb-2">
            Fecha desde la cual comenzarán a regir la participación y las asignaciones de esta acreditación.
          </p>
          <DateInput
            value={fechaInicio} onChange={(e) => onFechaInicioChange(e.target.value)}
            disabled={yaHayProgreso}
            data-asistente-ref={REF_FECHA_INICIO}
            className={`w-full max-w-xs px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-100 disabled:text-gray-500 ${CLASE_RESALTADO}`}
          />
          <p className="text-[11px] text-slate-400 mt-1.5">
            La fecha debe ser válida según las reglas del proyecto y no puede contradecir las fechas de vigencia aplicables.
          </p>
        </div>
      </Tarjeta>

      {/* Bloque 2 — Asignaciones */}
      <Tarjeta titulo="Asignaciones" accion={<LinkEditar onClick={editar(5)} />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tarjetaAsignacion(
            "Personas", Users, personas, "personas",
            recursos.length > 0
              ? "No hay personas seleccionadas. La maquinaria será considerada en la creación de la acreditación."
              : "Sin personas asignadas.",
          )}
          {tarjetaAsignacion(
            "Maquinarias", Truck, recursos, "maquinarias",
            personas.length > 0
              ? "No hay maquinarias seleccionadas. Las personas serán consideradas en la creación de la acreditación."
              : "Sin maquinarias asignadas.",
          )}
        </div>
        {personas.length === 0 && recursos.length === 0 && (
          <p className="text-[11px] text-slate-400">El Expediente se creará sin asignaciones: puedes agregarlas después desde el proyecto.</p>
        )}
        {trasladados.length > 0 && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5">
            <p className="flex items-center gap-2 text-xs font-bold text-amber-800">
              <ArrowRightLeft className="w-4 h-4" /> Traslados entre proyectos — {trasladados.length} {trasladados.length === 1 ? "recurso" : "recursos"}
            </p>
            <p className="text-[11px] text-amber-800">
              {trasladados.length} {trasladados.length === 1 ? "persona o maquinaria está actualmente asignada" : "personas o maquinarias están actualmente asignadas"} a otro
              proyecto y {trasladados.length === 1 ? "será trasladada" : "serán trasladadas"} automáticamente al confirmar.
            </p>
            <button type="button" onClick={() => setDetalle("traslados")} className="text-[11px] font-bold text-amber-800 hover:underline">
              Ver detalle de traslados →
            </button>
          </div>
        )}
      </Tarjeta>

      {/* Bloque 3 — Estado del expediente */}
      <Tarjeta
        titulo="Estado del expediente"
        accion={<span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Pendiente</span>}
      >
        {totalReq === null ? (
          <p className="text-xs text-slate-400">Sin datos de requisitos todavía: vuelve al paso anterior.</p>
        ) : (
          <>
            <div className="flex items-end justify-between gap-3">
              <p className="text-2xl font-black text-carbon-dark">
                {cubiertos} <span className="text-sm font-semibold text-slate-400">de {totalReq} requisitos cubiertos</span>
              </p>
              <span className="text-sm font-black text-primary">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 rounded-xl bg-sage-lighter/60 border border-sage-light">
                <p className="text-lg font-black text-sage-darker">{cubiertos}</p>
                <p className="text-[11px] font-semibold text-sage-darker">Cubiertos por reutilización</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-lg font-black text-amber-700">{pendientes}</p>
                <p className="text-[11px] font-semibold text-amber-700">Pendientes por completar</p>
              </div>
            </div>
            <button type="button" onClick={() => setDetalle("requisitos")} className="text-[11px] font-bold text-primary hover:text-primary-dark">
              Ver requisitos →
            </button>
          </>
        )}
      </Tarjeta>

      {(ejecutando || progreso || errorEjecucion) && (
        <div className="p-4 rounded-xl border border-slate-100 bg-white space-y-2">
          <ItemProgreso estado={estadoParticipacion} label="Crear Participación" />
          <ItemProgreso estado={estadoAsignaciones} label={`Crear Asignaciones${seleccion.length ? ` (${seleccion.length})` : ""}`} />
          <ItemProgreso estado={estadoExpediente} label="Crear Expediente" />
        </div>
      )}

      {errorEjecucion && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <span>{errorEjecucion.mensaje}</span>
          </div>
        </div>
      )}

      {problemas.length > 0 && !ejecutando && (
        <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs space-y-2">
          <p className="flex items-center gap-2 font-bold">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            No se puede crear la acreditación:
          </p>
          <ul className="space-y-1.5 pl-6">
            {problemas.map((p) => (
              <li key={p.ref + p.mensaje} className="flex items-center justify-between gap-3 flex-wrap">
                <span>{p.mensaje}</span>
                {/* Con algo ya creado no se puede volver a pasos anteriores. */}
                {(!yaHayProgreso || p.ref === REF_FECHA_INICIO) && (
                  <button
                    type="button"
                    onClick={() => onCorregir?.(p.paso, p.ref)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-red-200 font-bold text-red-700 hover:bg-red-100 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  >
                    {p.etiqueta} →
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleCrear}
          disabled={ejecutando || problemas.length > 0}
          className="px-6 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all disabled:opacity-50"
        >
          {ejecutando ? "Procesando..." : errorEjecucion ? "Reintentar" : "Crear acreditación"}
        </button>
      </div>

      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setConfirmando(false)}>
          <div className="bg-white rounded-2xl shadow-dropdown w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-carbon-dark">¿Confirmas la creación de esta acreditación?</h3>
            <p className="text-xs text-slate-500">
              Se registrará la participación de la empresa en el proyecto y se aplicarán las asignaciones configuradas.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50"
              >
                Volver a revisar
              </button>
              <button
                type="button"
                onClick={() => { setConfirmando(false); onConfirmar(); }}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all"
              >
                Confirmar y crear acreditación
              </button>
            </div>
          </div>
        </div>
      )}

      {detalle === "personas" && (
        <DetalleModal titulo="Personas asignadas" onCerrar={() => setDetalle(null)}>
          <ul className="space-y-2">{personas.map(filaEntidad)}</ul>
        </DetalleModal>
      )}
      {detalle === "maquinarias" && (
        <DetalleModal titulo="Maquinarias asignadas" onCerrar={() => setDetalle(null)}>
          <ul className="space-y-2">{recursos.map(filaEntidad)}</ul>
        </DetalleModal>
      )}
      {detalle === "traslados" && (
        <DetalleModal titulo="Traslados entre proyectos" onCerrar={() => setDetalle(null)}>
          <ul className="space-y-2">
            {trasladados.map((e) => (
              <li key={`${e.tipo}-${e.id}`} className="text-xs border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                <span className="font-semibold text-carbon-dark">{e.nombre}</span>
                <span className="text-slate-500"> ({e.tipo === "persona" ? "Persona" : "Maquinaria"}) — desde </span>
                <span className="font-semibold text-amber-700">{e.participacionActiva.proyectoNombre}</span>
                <span className="text-slate-500"> hacia {proyectoSel?.nombre}</span>
              </li>
            ))}
          </ul>
        </DetalleModal>
      )}
      {detalle === "requisitos" && (
        <DetalleModal titulo="Requisitos del expediente" onCerrar={() => setDetalle(null)}>
          {preview && (
            <div className="space-y-2">
              {[
                { key: "empresa", label: "Empresa" },
                { key: "personas", label: "Personas" },
                { key: "maquinarias", label: "Maquinarias" },
              ].map(({ key, label }) => {
                const b = preview[key];
                if (!b || b.total === 0) return null;
                return (
                  <div key={key} className="flex items-center justify-between text-xs p-3 rounded-xl border border-slate-100">
                    <span className="font-bold text-carbon-dark">{label}</span>
                    <span className="text-slate-500">
                      {b.total} requisitos · <b className="text-sage-dark">{b.reutilizables} cubiertos</b> · <b className="text-amber-600">{b.total - b.reutilizables} pendientes</b>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {Array.isArray(requisitosPerfil) && requisitosPerfil.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Requisitos del Perfil {perfilSel?.nombre}</p>
              <ul className="space-y-1">
                {requisitosPerfil.map((r) => (
                  <li key={r.requerimientoId} className="flex items-center justify-between gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                    <span className="font-medium">{r.nombreCorto || r.nombre}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">{etiquetaTipoEntidad(r.tipoEntidad)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DetalleModal>
      )}
    </div>
  );
};
