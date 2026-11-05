import React, { useEffect, useState } from "react";
import { Search, Plus, HardHat, AlertCircle, IdCard } from "lucide-react";
import { empresaService } from "../../../services/empresaService";
import { participacionService } from "../../../services/participacionService";
import { estadoTarjetaProyecto, MENSAJE_NO_APLICA } from "./estadoTarjetaProyecto";
import { formatRutDisplay } from "../../../utils/rutFormatters";
import { ErrorBanner } from "../../../components/shared/ErrorBanner";
import { ActionButton } from "../../../components/shared/ActionButton";
import { EntityIconTile } from "../../../components/shared/EntityIconTile";
import { NuevaEmpresaForm } from "../../../components/empresas/NuevaEmpresaForm";

// Situación de la Empresa en el Proyecto ya elegido, con la misma prioridad que el backend
// (activa > suspendida > pendiente): "no_aplica" si ya participa, "pendiente" si se completa la
// existente, "nueva" si no tiene relación vigente.
const ESTADO_EMPRESA = {
  pendiente: { label: "Pendiente", className: "bg-amber-50 text-amber-700 border-amber-200" },
  no_aplica: { label: "No aplica", className: "bg-slate-100 text-slate-500 border-slate-200" },
};
const relacionEn = (participaciones, empresaId) => {
  const propias = participaciones.filter((x) => x.empresaId === empresaId);
  for (const estado of ["activa", "suspendida", "pendiente"]) {
    if (propias.some((x) => x.estado === estado)) return { estado };
  }
  return null;
};

// `mandanteId`: Mandante del flujo; solo se listan las Empresas asociadas a él (empresaMandantes).
// `proyectoId`: Proyecto ya elegido; cada Empresa muestra su situación en él (las que ya participan
// no se pueden elegir). `avisoCarpeta`: aviso de la carpeta elegida (no corresponde a la empresa).
export const PasoEmpresa = ({ mandanteId, empresaId, onSeleccionar, proyectoId = null, proyectoNombre = null, avisoPerfil = null, avisoCarpeta = null }) => {
  const [empresas, setEmpresas] = useState([]);
  const [participaciones, setParticipaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [mostrarCrear, setMostrarCrear] = useState(false);

  const cargar = () => {
    if (!mandanteId) return;
    setLoading(true);
    setError(null);
    empresaService.listar("activo", { mandanteId })
      .then((data) => setEmpresas(data || []))
      .catch((err) => setError(err.message || "No se pudieron cargar las empresas."))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [mandanteId]);

  useEffect(() => {
    if (!proyectoId) return undefined;
    let vigente = true;
    participacionService.listar({ proyectoId })
      .then((data) => { if (vigente) setParticipaciones(data || []); })
      .catch(() => { if (vigente) setParticipaciones([]); });
    return () => { vigente = false; };
  }, [proyectoId]);
  const estadoDe = (id) => estadoTarjetaProyecto({ participacionEmpresa: relacionEn(participaciones, id) });
  const seleccionadaEstado = empresaId ? estadoDe(empresaId) : null;

  const filtradas = empresas.filter((e) => {
    const term = search.toLowerCase();
    return (
      e.razonSocial?.toLowerCase().includes(term) ||
      e.rut?.toLowerCase().includes(term)
    );
  });

  const handleCreada = (empresa) => {
    setMostrarCrear(false);
    cargar();
    onSeleccionar(empresa);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Selecciona la Empresa a acreditar</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Elige una Empresa activa asociada al Mandante, o crea una nueva sin salir de este flujo.
          {proyectoNombre && <> Cada tarjeta indica la situación de la Empresa en <b>{proyectoNombre}</b>.</>}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por razón social o RUT..."
            className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <ActionButton variant="primary" icon={Plus} onClick={() => setMostrarCrear((v) => !v)}>
          {mostrarCrear ? "Cancelar" : "Crear nueva Empresa"}
        </ActionButton>
      </div>

      <ErrorBanner message={error} />

      {mostrarCrear && (
        <NuevaEmpresaForm variante="compacta" mandanteId={mandanteId} onCreada={handleCreada} onCancelar={() => setMostrarCrear(false)} />
      )}

      {loading ? (
        <p className="text-xs text-slate-400 py-8 text-center">Cargando empresas...</p>
      ) : filtradas.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">No se encontraron empresas activas asociadas a este Mandante.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtradas.map((e) => {
            const estado = estadoDe(e.id);
            const info = ESTADO_EMPRESA[estado];
            const deshabilitada = estado === "no_aplica";
            return (
            <button
              key={e.id}
              type="button"
              disabled={deshabilitada}
              title={deshabilitada ? MENSAJE_NO_APLICA : undefined}
              onClick={() => { if (!deshabilitada) onSeleccionar(e); }}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                deshabilitada ? "border-gray-100 bg-slate-50 opacity-60 cursor-not-allowed"
                  : empresaId === e.id ? "border-primary bg-primary-lighter" : "border-gray-100 hover:border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                {e.logoUrl ? (
                  <img
                    src={e.logoUrl}
                    alt=""
                    className="w-9 h-9 rounded-full object-contain border border-slate-100 flex-shrink-0"
                  />
                ) : (
                  <EntityIconTile icon={HardHat} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-carbon-dark truncate">{e.razonSocial}</p>
                    {info && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${info.className}`}>{info.label}</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">{formatRutDisplay(e.rut)}</p>
                  {e.giro && <p className="text-[11px] text-slate-400 mt-1">{e.giro}</p>}
                  {deshabilitada && <p className="text-[11px] text-amber-700 mt-1.5">{MENSAJE_NO_APLICA}</p>}
                </div>
              </div>
            </button>
            );
          })}
        </div>
      )}

      {avisoCarpeta && (
        <p role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> <span>{avisoCarpeta}</span>
        </p>
      )}

      {seleccionadaEstado === "pendiente" && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Ya existe una participación pendiente para esta empresa en este proyecto — se completará en vez de crear una nueva.</span>
        </div>
      )}

      {avisoPerfil && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-primary-lighter/60 border border-primary/20 text-primary-dark text-xs">
          <IdCard className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Este proyecto tiene un único Perfil disponible: <strong>{avisoPerfil}</strong>, ya preseleccionado. Podrás revisar los requisitos en el siguiente paso.
          </span>
        </div>
      )}
    </div>
  );
};
