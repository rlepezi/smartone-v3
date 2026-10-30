import React from "react";
import { CheckCircle2, XCircle, AlertCircle, Clock, PauseCircle } from "lucide-react";
import { cn } from "../../utils/cn";
import { ESTADOS_CUMPLIMIENTO } from "../../utils/estadosCumplimiento";

// Paleta de estado unificada para todo el sistema:
//   positivo (sage): activo, cumple, aprobado, en_ejecucion
//   intermedio/atención (ámbar): pendiente, en_revision, suspendida(o),
//     con_observaciones
//   negativo (rojo): no_cumple, inactivo, bloqueado
//   informativo neutro (primary — token custom, NUNCA sky-* genérico):
//     planificado, creado
//   terminal/cerrado (gris/slate): finalizado(a), archivado, cerrado, reemplazada

export const MAPA_ACTIVO_INACTIVO = {
  activo: {
    label: "Activo",
    className: "bg-sage-lighter text-sage-darker border-sage-light",
    Icon: CheckCircle2,
  },
  inactivo: {
    label: "Inactivo",
    className: "bg-red-50 text-red-700 border-red-200",
    Icon: XCircle,
  },
};

export const MAPA_ACTIVO_INACTIVO_BLOQUEADO = {
  ...MAPA_ACTIVO_INACTIVO,
  bloqueado: {
    label: "Bloqueado",
    className: "bg-red-50 text-red-700 border-red-200",
    Icon: AlertCircle,
  },
};

// Usuarios (Fase D de "Usuarios — actividad, métricas y gestión de
// accesos"): Firebase Auth solo controla activo/inactivo — "bloqueado por
// intentos fallidos" no es un estado real del sistema, así que no se
// muestra. El valor almacenado sigue siendo "inactivo"; la etiqueta visible
// es "Desactivado" porque la acción del usuario es "Desactivar".
export const MAPA_ACTIVO_DESACTIVADO = {
  activo: MAPA_ACTIVO_INACTIVO.activo,
  inactivo: {
    label: "Desactivado",
    className: "bg-red-50 text-red-700 border-red-200",
    Icon: XCircle,
  },
};

// Compartido por Dashboard, Expediente y Reportes (resultado de Evaluación).
// Colores desde utils/estadosCumplimiento (los mismos de las donas y sus leyendas).
export const MAPA_EVALUACION = Object.fromEntries(
  ESTADOS_CUMPLIMIENTO.map((e) => [e.key, { label: e.label, className: e.badge }]),
);

// Compartido por Participación (detalle y lista) y por el estado de
// Asignación embebido en Proyecto (mismo set de palabras, "suspendida" no
// aplica a Asignación pero es inofensivo dejarla sin uso ahí).
export const MAPA_ESTADO_PARTICIPACION = {
  pendiente: {
    label: "Pendiente",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    Icon: Clock,
  },
  activa: {
    label: "Activa",
    className: "bg-sage-lighter text-sage-darker border-sage-light",
    Icon: CheckCircle2,
  },
  suspendida: {
    label: "Suspendida",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    Icon: PauseCircle,
  },
  finalizada: {
    label: "Finalizada",
    className: "bg-slate-100 text-slate-600 border-slate-200",
    Icon: XCircle,
  },
};

export const StatusBadge = ({ value, map }) => {
  const entry = map[value] || {
    label: value || "-",
    className: "bg-slate-100 text-slate-600 border-slate-200",
  };
  const Icon = entry.Icon;

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border",
        Icon && "gap-1.5",
        entry.className,
      )}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {entry.label}
    </span>
  );
};
