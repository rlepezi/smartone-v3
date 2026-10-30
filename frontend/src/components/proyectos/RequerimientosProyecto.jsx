import React, { useEffect, useState } from "react";
import { expedienteService } from "../../services/expedienteService";
import { StatusBadge, MAPA_EVALUACION } from "../shared/StatusBadge";
import { RequerimientosLista } from "../shared/RequerimientosLista";
import { ActionButton } from "../shared/ActionButton";
import { PlanillaEvaluacion } from "../expedientes/PlanillaEvaluacion";
import { BarraCumplimiento } from "./EmpresasParticipantesTable";

const NIVELES = [
  { key: "empresa", label: "Empresa" },
  { key: "persona", label: "Personas" },
  { key: "recurso", label: "Maquinarias" },
];

const RESUELTOS = ["cumple", "no_aplica"];

// Requerimientos de los Expedientes abiertos del Proyecto, uno por Empresa, a partir de sus
// instancias activas (expedienteRequerimientos). Solo lectura. Los de nivel Empresa muestran su
// resultado; los de Persona/Maquinaria, cuántas de sus instancias ya están resueltas (cumple o no
// aplica) sobre el total. El % de cada Empresa viene de `participantes` (contadores del
// Expediente): acá no se recalcula cumplimiento.
//
// En modo edición (`modoEdicion`) cada Empresa suma una sección "Evaluar": la Empresa,
// sus Personas y sus Maquinarias, cada uno con la MISMA planilla de evaluación de
// EvaluarExpedientePage (PlanillaEvaluacion), embebida y abierta bajo demanda.
// `onCambio` avisa al detalle para refrescar sus cifras.
export const RequerimientosProyecto = ({
  proyectoId, participantes, sujetos, personas = [], recursos = [], modoEdicion = false, onCambio,
}) => {
  const [version, setVersion] = useState(0);
  const [planillaAbierta, setPlanillaAbierta] = useState(null); // "expId|tipo|id"
  // undefined = cargando, null = falló, objeto = cargado.
  const [datos, setDatos] = useState(undefined);

  useEffect(() => {
    let activo = true;
    expedienteService.listar({})
      .then(async (todos) => {
        const expedientes = (todos || []).filter((e) => e.proyectoId === proyectoId && e.estado !== "cerrado");
        const instancias = await Promise.all(expedientes.map((e) => expedienteService.listarRequerimientos(e.id)));
        if (!activo) return;
        setDatos({
          expedientes,
          instanciasPorExpediente: Object.fromEntries(expedientes.map((e, i) => [e.id, instancias[i] || []])),
        });
      })
      .catch(() => { if (activo) setDatos(null); });
    return () => { activo = false; };
  }, [proyectoId, version]);

  const handleEvaluado = () => {
    setVersion((v) => v + 1);
    onCambio?.();
  };

  if (datos === undefined) return <p className="text-xs text-slate-400 py-6 text-center">Cargando requerimientos...</p>;
  if (datos === null) return <p className="text-xs text-red-600 py-6 text-center">No se pudieron cargar los requerimientos.</p>;
  if (datos.expedientes.length === 0) {
    return <p className="text-xs text-slate-400 py-6 text-center">Este proyecto no tiene expedientes abiertos.</p>;
  }

  return (
    <div className="space-y-5">
      {datos.expedientes.map((exp) => {
        const empresa = participantes.find((p) => p.empresaId === exp.empresaId);
        const sujetosEmpresa = sujetos.filter((a) => a.participacionId === exp.participacionId);
        const instancias = datos.instanciasPorExpediente[exp.id] || [];
        // Un renglón por Requerimiento (las instancias de Persona/Maquinaria se agrupan).
        const porRequerimiento = new Map();
        instancias.forEach((i) => {
          if (!porRequerimiento.has(i.requerimientoId)) {
            porRequerimiento.set(i.requerimientoId, {
              requerimientoId: i.requerimientoId, nombre: i.nombre, nombreCorto: i.nombreCorto,
              tipoEntidad: i.tipoEntidad, requiereVencimiento: i.requiereVencimiento, instancias: [],
            });
          }
          porRequerimiento.get(i.requerimientoId).instancias.push(i);
        });
        const aplicables = [...porRequerimiento.values()];

        return (
          <div key={exp.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-carbon-dark">{empresa?.empresaNombre || exp.empresaId}</h3>
                {empresa?.perfilParticipacion && <p className="text-[11px] text-slate-400">{empresa.perfilParticipacion}</p>}
              </div>
              <BarraCumplimiento pct={empresa?.cumplimientoPct} />
            </div>

            {aplicables.length === 0 ? (
              <p className="text-xs text-slate-400">Este expediente no tiene requerimientos aplicables.</p>
            ) : (
              NIVELES.map(({ key, label }) => {
                const items = aplicables.filter((r) => r.tipoEntidad === key);
                if (items.length === 0) return null;
                return (
                  <div key={key}>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
                    <RequerimientosLista
                      items={items}
                      renderEstado={(r) => {
                        if (key === "empresa") {
                          return <StatusBadge value={r.instancias[0]?.resultado || "pendiente"} map={MAPA_EVALUACION} />;
                        }
                        const cumplen = r.instancias.filter((i) => RESUELTOS.includes(i.resultado)).length;
                        return <span className="text-xs font-bold text-carbon-dark">{cumplen}/{r.instancias.length} cumplen</span>;
                      }}
                    />
                  </div>
                );
              })
            )}

            {modoEdicion && (
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Evaluar</p>
                {[
                  { clave: `${exp.id}|empresa|`, etiqueta: "Empresa (requerimientos de nivel Empresa)", props: {} },
                  ...[...new Set(sujetosEmpresa.filter((a) => a.personaId).map((a) => a.personaId))].map((pid) => {
                    const p = personas.find((x) => x.id === pid);
                    return { clave: `${exp.id}|persona|${pid}`, etiqueta: p ? `Persona: ${p.nombre} ${p.apellido}` : `Persona: ${pid}`, props: { personaId: pid } };
                  }),
                  ...[...new Set(sujetosEmpresa.filter((a) => a.recursoId).map((a) => a.recursoId))].map((rid) => {
                    const r = recursos.find((x) => x.id === rid);
                    return { clave: `${exp.id}|recurso|${rid}`, etiqueta: `Maquinaria: ${r?.nombre || rid}`, props: { recursoId: rid } };
                  }),
                ].map((sujeto) => {
                  const abierta = planillaAbierta === sujeto.clave;
                  return (
                    <div key={sujeto.clave} className="rounded-xl border border-slate-100 p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-semibold text-slate-700">{sujeto.etiqueta}</span>
                        <ActionButton onClick={() => setPlanillaAbierta(abierta ? null : sujeto.clave)}>
                          {abierta ? "Cerrar" : "Evaluar"}
                        </ActionButton>
                      </div>
                      {abierta && (
                        <PlanillaEvaluacion embebido expedienteId={exp.id} {...sujeto.props} onGuardado={handleEvaluado} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
