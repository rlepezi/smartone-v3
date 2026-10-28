import { estadoVencimientosExpediente } from "./vencimientos";

// `vencidos`: cantidad (desde el endpoint de vencimientos) o, en los listados (sin consultas por
// fila), undefined: se deduce de resumen.fechaVencimientoMasProxima.
const hayVencidos = (expediente, vencidos) => (vencidos === undefined
  ? estadoVencimientosExpediente(expediente) === "vencidos" : vencidos > 0);

// Estado que se muestra: un Expediente "completado" con documentos vencidos se ve como
// "Completado con pendientes" (los vencidos dependen del día y el backend no los guarda en el estado).
export const estadoVisibleExpediente = (expediente, vencidos) => {
  const estado = expediente?.estado;
  return estado === "completado" && hayVencidos(expediente, vencidos) ? "completado_pendientes" : estado;
};

// Qué falta en un Expediente completado (o completado con pendientes), o null si nada: requisitos
// vencidos y pendientes (nuevos sin evaluar). Los "no cumple" son resultado, no pendientes: se ven en
// el % de cumplimiento. `vencidos`: `true` = "hay alguno" (listado).
export const problemasExpediente = (expediente, vencidos) => {
  if (!["completado", "completado_pendientes"].includes(expediente?.estado)) return null;
  const r = expediente.resumen || {};
  const problemas = {
    vencidos: vencidos ?? (estadoVencimientosExpediente(expediente) === "vencidos" ? true : 0),
    pendientes: r.pendiente || 0,
  };
  return problemas.vencidos || problemas.pendientes ? problemas : null;
};

// "2 requisitos vencidos, 3 pendientes" (solo los que existen).
export const textoProblemas = (problemas) => {
  if (!problemas) return "";
  const partes = [];
  if (problemas.vencidos === true) {
    partes.push("requisitos vencidos");
  } else if (problemas.vencidos) {
    partes.push(`${problemas.vencidos} ${problemas.vencidos === 1 ? "requisito vencido" : "requisitos vencidos"}`);
  }
  if (problemas.pendientes) {
    partes.push(`${problemas.pendientes} ${problemas.pendientes === 1 ? "requisito pendiente" : "requisitos pendientes"}`);
  }
  return partes.join(", ");
};
