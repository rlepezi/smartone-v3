import React, { useEffect, useState } from "react";
import { expedienteService } from "../../services/expedienteService";
import { evaluacionService } from "../../services/evaluacionService";
import { formatCatalogo } from "../../utils/formatCatalogo";
import { formatRutDisplay } from "../../utils/rutFormatters";
import { formatFecha } from "../../utils/fechas";
import { evaluarSujeto } from "../../utils/cumplimientoCalculos";
import { nombresPerfiles } from "../../services/participacionSujetoService";
import { usePerfilesRecurso } from "../../hooks/usePerfilesRecurso";
import { RecursosBloques } from "../shared/RecursosBloques";

// Pestaña "Recursos" del detalle de Proyecto: Personas y Maquinarias activas,
// agrupadas por Empresa participante. `cabecera` es el bloque de gestión de
// Personas/Maquinarias asignadas ("+ Nueva Asignación"), arriba de todo. `sujetos`: agrupados
// por Persona/Maquinaria, con el conjunto de sus Perfiles de Recurso.
export const RecursosProyecto = ({
  proyectoId, participantes, participaciones, sujetos, personas, recursos,
  cabecera, accionFila,
}) => {
  // undefined = cargando, null = falló, objeto = cargado.
  const [datos, setDatos] = useState(undefined);
  const perfilesPorId = usePerfilesRecurso();

  useEffect(() => {
    let activo = true;
    Promise.all([
      expedienteService.listar({}),
      evaluacionService.listarGlobal({ proyectoId }),
    ])
      .then(([expedientes, evaluaciones]) => {
        if (!activo) return;
        setDatos({
          expedientes: (expedientes || []).filter((e) => e.proyectoId === proyectoId && e.estado !== "cerrado"),
          vigentes: (evaluaciones || []).filter((ev) => ev.estado === "vigente"),
        });
      })
      .catch(() => { if (activo) setDatos(null); });
    return () => { activo = false; };
  }, [proyectoId]);

  const construirBloques = (subTab) => {
    const esPersonas = subTab === "personas";
    const campo = esPersonas ? "personaId" : "recursoId";

    return participantes.map((emp) => {
      const participacion = participaciones.find((p) => p.empresaId === emp.empresaId && p.estado === "activa");
      const expediente = datos.expedientes.find((e) => e.empresaId === emp.empresaId);

      const filas = sujetos
        .filter((a) => a.empresaId === emp.empresaId && a[campo])
        .map((a) => {
          const sujeto = esPersonas
            ? personas.find((p) => p.id === a.personaId)
            : recursos.find((r) => r.id === a.recursoId);
          return {
            key: a.id,
            nombre: esPersonas
              ? (sujeto ? `${sujeto.nombre} ${sujeto.apellido}` : a.personaId)
              : (sujeto?.nombre || a.recursoId),
            secundario: esPersonas ? (sujeto?.rut ? formatRutDisplay(sujeto.rut) : "") : (sujeto?.patente || ""),
            tipoIdentificacion: esPersonas ? null : sujeto?.tipoIdentificacion || null,
            clasificacion: nombresPerfiles(a.perfilRecursoIds, perfilesPorId) || (sujeto?.tipo ? formatCatalogo(sujeto.tipo) : ""),
            evaluacion: evaluarSujeto({ expediente, vigentes: datos.vigentes, campo, sujetoId: a[campo], perfilRecursoIds: a.perfilRecursoIds }),
          };
        });

      return {
        key: emp.empresaId,
        titulo: emp.empresaNombre,
        subtitulo: participacion
          ? `${formatFecha(participacion.fechaInicio)} – ${participacion.fechaTermino ? formatFecha(participacion.fechaTermino) : "sin término"}`
          : "-",
        perfil: emp.perfilParticipacion,
        filas,
      };
    });
  };

  return (
    <RecursosBloques
      cabecera={cabecera}
      estado={datos === undefined ? "cargando" : datos === null ? "error" : "listo"}
      construirBloques={construirBloques}
      accionFila={accionFila}
      mensajeSinBloques="Este proyecto no tiene empresas participando activamente."
    />
  );
};
