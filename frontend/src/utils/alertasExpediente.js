import { estadoVencimientosExpediente } from "./vencimientos";

// Alerta de un Expediente "En Ejecución": en esa fase el estado ya no se recalcula, así que si
// aparecen requisitos vencidos, pendientes (incluye sin evaluar) o que no cumplen, el Expediente
// conserva su estado y se avisa. Pendientes y no cumple salen de `resumen`; los vencidos dependen
// del día, así que se pasan desde el endpoint de vencimientos (`vencidos`) o, en el listado (sin
// consultas por fila), se deducen de resumen.fechaVencimientoMasProxima: `true` = "hay alguno".

// Problemas del Expediente, o null si no está en ejecución o no tiene ninguno.
export const problemasEnEjecucion = (expediente, vencidos) => {
  if (expediente?.estado !== "en_ejecucion") return null;
  const r = expediente.resumen || {};
  const problemas = {
    vencidos: vencidos ?? (estadoVencimientosExpediente(expediente) === "vencidos" ? true : 0),
    noCumple: r.noCumple || 0,
    pendientes: r.pendiente || 0,
  };
  return problemas.vencidos + problemas.noCumple + problemas.pendientes > 0 ? problemas : null;
};

// "2 requisitos vencidos, 1 no cumple, 3 pendientes" (solo los que existen).
export const textoProblemas = (problemas) => {
  if (!problemas) return "";
  const partes = [];
  if (problemas.vencidos === true) {
    partes.push("requisitos vencidos");
  } else if (problemas.vencidos) {
    partes.push(`${problemas.vencidos} ${problemas.vencidos === 1 ? "requisito vencido" : "requisitos vencidos"}`);
  }
  if (problemas.noCumple) {
    partes.push(`${problemas.noCumple} ${problemas.noCumple === 1 ? "no cumple" : "no cumplen"}`);
  }
  if (problemas.pendientes) {
    partes.push(`${problemas.pendientes} ${problemas.pendientes === 1 ? "pendiente" : "pendientes"}`);
  }
  return partes.join(", ");
};
