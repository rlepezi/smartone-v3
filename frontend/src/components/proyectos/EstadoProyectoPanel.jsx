import React, { useEffect, useState } from "react";
import { reporteService } from "../../services/reporteService";
import { expedienteService } from "../../services/expedienteService";
import { evidenciaService } from "../../services/evidenciaService";
import { KpiAnillo, TarjetaPanel } from "../shared/DetalleUI";

// Sidebar "Estado del Proyecto": % de avance general + conteos. Todo sale de los
// mismos datos que ya usa el detalle del Proyecto — no hay cálculos nuevos:
//   - avance y Evaluaciones: reporteService.obtenerResumen({proyectoId}) (mismo
//     _calcularAvanceRequerimientos); Evaluaciones = Requerimientos con
//     evaluación vigente registrada (cualquier resultado).
//   - Participaciones: las Empresas de GET /reportes/proyectos/:id/participantes
//     (la misma tabla/KPI del detalle).
//   - Requerimientos: los aplicables de los Expedientes abiertos del Proyecto.
//   - Documentación: Evidencias de los Expedientes del Proyecto (igual que la
//     pestaña Documentación del detalle).
export const EstadoProyectoPanel = ({ proyectoId }) => {
  // undefined = cargando, null = falló, objeto = cargado.
  const [datos, setDatos] = useState(undefined);

  useEffect(() => {
    let activo = true;
    Promise.all([
      reporteService.obtenerResumen({ proyectoId }),
      reporteService.obtenerParticipantesPorProyecto(proyectoId),
      expedienteService.listar({}),
      evidenciaService.listar({}),
    ])
      .then(([resumen, participantes, expedientes, evidencias]) => {
        if (!activo) return;
        const delProyecto = (expedientes || []).filter((e) => e.proyectoId === proyectoId);
        const ids = new Set(delProyecto.map((e) => e.id));
        const req = resumen?.requerimientos || {};
        setDatos({
          avance: req.avancePct ?? null,
          participaciones: (participantes || []).length,
          requerimientos: delProyecto
            .filter((e) => e.estado !== "cerrado")
            .reduce((acc, e) => acc + (e.resumen?.activas || 0), 0),
          documentos: (evidencias || []).filter((ev) => ids.has(ev.expedienteId)).length,
          // Requerimientos ya evaluados (cumple / no cumple / no aplica).
          evaluaciones: (req.cumple || 0) + (req.noCumple || 0) + (req.noAplica || 0),
        });
      })
      .catch(() => { if (activo) setDatos(null); });
    return () => { activo = false; };
  }, [proyectoId]);

  const filas = datos ? [
    ["Participaciones", datos.participaciones],
    ["Requerimientos", datos.requerimientos],
    ["Documentación", datos.documentos],
    ["Evaluaciones", datos.evaluaciones],
  ] : [];

  return (
    <TarjetaPanel titulo="Estado del Proyecto">
      {datos === undefined ? (
        <p className="text-xs text-slate-400">Cargando...</p>
      ) : datos === null ? (
        <p className="text-xs text-red-600">No se pudo cargar el estado del proyecto.</p>
      ) : (
        <div className="space-y-4">
          <div className="mx-auto w-fit">
            <KpiAnillo pct={datos.avance} size={112} strokeWidth={10} textoClass="text-xl" />
          </div>
          <p className="text-center text-[11px] font-semibold text-slate-500">Avance general</p>
          <div className="space-y-2">
            {filas.map(([etiqueta, valor]) => (
              <div key={etiqueta} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">{etiqueta}</span>
                <span className="font-black text-carbon-dark">{valor}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </TarjetaPanel>
  );
};
