import React from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { Info, Landmark, Building2, FolderKanban, FolderOpen, IdCard, Users, Truck } from "lucide-react";
import { textoRepositorio } from "../../utils/repositorioDocumental";
import { MandanteChip } from "./MandanteChip";

// Panel lateral dinámico del wizard "Nueva Acreditación" — reemplaza el
// panel estático `CaminoAcreditacionPanel` (que sigue existiendo y
// usándose en el Dashboard). Refleja en vivo lo que el usuario va
// eligiendo en cada paso, mismo lenguaje visual que
// `ResumenReemplazoPanel` (wizard de Reemplazar Acreditación), para
// mantener consistencia entre ambos flujos.
const Fila = ({ icon: Icon, label, value, placeholder = "Sin seleccionar" }) => (
  <div className="flex items-start gap-2.5">
    <Icon className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-xs font-bold truncate ${value ? "text-carbon-dark" : "text-slate-400 italic font-medium"}`}>
        {value || placeholder}
      </p>
    </div>
  </div>
);

// Mandante lleva chip con logo (no un simple texto como el resto de `Fila`) — se muestra desde que
// se elige en el Paso 1 del wizard (o desde el inicio, si el actor tiene Mandante fijo); antes, el
// mismo placeholder "Sin seleccionar".
const FilaMandante = ({ mandante }) => (
  <div className="flex items-start gap-2.5">
    <Landmark className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Mandante</p>
      {mandante ? (
        <MandanteChip nombre={getMandanteDisplayName(mandante)} logoUrl={mandante.logoUrl} />
      ) : (
        <p className="text-xs text-slate-400 italic font-medium">Sin seleccionar</p>
      )}
    </div>
  </div>
);

export const ResumenAcreditacionPanel = ({
  mandanteSel = null, empresaSel, proyectoSel, perfilSel, seleccion = [],
  mostrarExpediente = false, requisitosTotal = null, reutilizadosEmpresa = null,
  mostrarDocumentacion = false, documentacion = null, proyectoActualId = null,
  repositorio, // { tipo, etiqueta, url } | null; undefined = no mostrar la fila
}) => {
  const personasCount = seleccion.filter((s) => s.tipo === "persona").length;
  const recursosCount = seleccion.filter((s) => s.tipo === "recurso").length;
  // Desglose por disponibilidad: quien está activo en otro proyecto requiere traslado.
  const enOtroProyecto = (tipo) => seleccion.filter(
    (s) => s.tipo === tipo && s.participacionActiva && s.participacionActiva.proyectoId !== proyectoActualId,
  ).length;
  const desglose = (tipo, total) => (total > 0 ? `${total - enOtroProyecto(tipo)} disponibles · ${enOtroProyecto(tipo)} en otro proyecto` : null);


  return (
    <div className="space-y-4">
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-card space-y-3">
        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
          Resumen de la Acreditación
        </h3>
        <div className="space-y-3 pt-1">
          <FilaMandante mandante={mandanteSel} />
          <Fila icon={Building2} label="Empresa" value={empresaSel?.razonSocial} />
          <Fila icon={FolderKanban} label="Proyecto" value={proyectoSel?.nombre} />
          <Fila icon={IdCard} label="Perfil de Participación" value={perfilSel?.nombre} />
          {repositorio !== undefined && (
            <div className="flex items-start gap-2.5">
              <FolderOpen className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Documentación</p>
                {repositorio ? (
                  <p className="text-xs font-bold text-carbon-dark truncate">
                    {repositorio.tipo === "sharepoint" && repositorio.url
                      ? <a href={repositorio.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">SharePoint</a>
                      : textoRepositorio(repositorio)}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 italic font-medium">Sin vincular</p>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-bold text-carbon-dark">{personasCount}</span>
            <span className="text-[11px] text-slate-400">Personas</span>
          </div>
          <div className="flex items-center gap-2">
            <Truck className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-bold text-carbon-dark">{recursosCount}</span>
            <span className="text-[11px] text-slate-400">Maquinarias</span>
          </div>
        </div>
        {(personasCount > 0 || recursosCount > 0) && (
          <div className="text-[11px] text-slate-400 space-y-0.5">
            {desglose("persona", personasCount) && <p>Personas: {desglose("persona", personasCount)}</p>}
            {desglose("recurso", recursosCount) && <p>Maquinarias: {desglose("recurso", recursosCount)}</p>}
          </div>
        )}
      </div>

      {mostrarDocumentacion && perfilSel && (
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-card space-y-2">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Documentación reutilizable</h3>
          {documentacion === null ? (
            <p className="text-[11px] text-slate-400">Calculando...</p>
          ) : (
            <>
              <p className="text-2xl font-black text-primary">
                {documentacion.reutilizables}
                <span className="text-xs font-semibold text-slate-400 ml-1.5">de {documentacion.total} requisitos</span>
              </p>
              <p className="text-[11px] text-slate-400">
                {documentacion.total - documentacion.reutilizables} quedarían por evaluar.
              </p>
            </>
          )}
        </div>
      )}

      {mostrarExpediente && perfilSel && (
        <>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-card space-y-2">
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Expediente</h3>
            <p className="text-2xl font-black text-carbon-dark">
              {requisitosTotal === null ? "…" : requisitosTotal}
              <span className="text-xs font-semibold text-slate-400 ml-1.5">requisitos</span>
            </p>
            <p className="text-[11px] text-slate-400">Del Perfil {perfilSel.nombre}.</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-card space-y-3">
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Expediente estimado</h3>
            {requisitosTotal === null || reutilizadosEmpresa === null ? (
              <p className="text-[11px] text-slate-400">Calculando...</p>
            ) : (
              <>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${requisitosTotal > 0 ? Math.round((reutilizadosEmpresa / requisitosTotal) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-[11px] font-semibold text-carbon-dark">
                  {reutilizadosEmpresa} de {requisitosTotal} requisitos cubiertos por reutilización a nivel Empresa
                </p>
                <p className="text-[11px] text-slate-400">{requisitosTotal - reutilizadosEmpresa} por evaluar en el expediente</p>
              </>
            )}
          </div>
        </>
      )}

      <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-primary-lighter/50 border border-primary/20 text-[11px] text-primary-dark">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>Se reutilizará documentación vigente cuando corresponda.</span>
      </div>
    </div>
  );
};
