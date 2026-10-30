import { formatFecha, hoyISO } from "./fechas";
import { ETIQUETA_TIPO, TIPOS_ENTIDAD, etiquetaGrupo } from "./reportePanel";

// Exportación del panel de Reportes a Excel: una hoja por sección, con los filtros aplicados en la
// primera fila. exceljs se carga recién al exportar (no pesa en la carga de la página).

const pct = (valor) => (valor === null || valor === undefined ? null : valor / 100);

const agregarHoja = (libro, nombre, textoFiltros, columnas, filas) => {
  const hoja = libro.addWorksheet(nombre);
  hoja.addRow([textoFiltros]);
  hoja.getRow(1).font = { italic: true, color: { argb: "FF64748B" } };
  hoja.addRow([]);
  const encabezado = hoja.addRow(columnas.map((c) => c.titulo));
  encabezado.font = { bold: true };
  filas.forEach((fila) => hoja.addRow(columnas.map((c) => c.valor(fila))));
  columnas.forEach((c, i) => {
    const columna = hoja.getColumn(i + 1);
    columna.width = c.ancho || 14;
    if (c.formato) columna.numFmt = c.formato;
  });
  return hoja;
};

// `textoFiltros`: "Mandante: … · Período: … · Proyecto: …". `perfilNombre`: perfil del ranking
// exportado ("Todos los perfiles" si no hay uno elegido).
export const exportarPanelExcel = async ({ panel, textoFiltros, perfilId, perfilNombre }) => {
  const { default: ExcelJS } = await import("exceljs");
  const libro = new ExcelJS.Workbook();
  libro.creator = "SmartOne";
  libro.created = new Date();
  const { indicadores: ind } = panel;

  agregarHoja(libro, "Indicadores", textoFiltros, [
    { titulo: "Indicador", valor: (f) => f[0], ancho: 40 },
    { titulo: "Valor", valor: (f) => f[1], ancho: 14 },
    { titulo: "Detalle", valor: (f) => f[2], ancho: 50 },
  ], [
    ["Expedientes activos", ind.expedientesActivos.total,
      `en ${ind.expedientesActivos.proyectos} proyectos · ${ind.expedientesActivos.empresas} empresas`],
    ["Cumplimiento actual (%)", ind.cumplimiento.pct,
      `${ind.cumplimiento.cumple} de ${ind.cumplimiento.aplicables} ítems aplicables cumplen hoy`],
    ["Aprobación a la primera revisión (%)", ind.primeraRevision.pct,
      `${ind.primeraRevision.aprobadas} de ${ind.primeraRevision.instancias} ítems`],
    ["Ítems evaluados en el período", ind.itemsEvaluados.total,
      `${ind.itemsEvaluados.cumple} cumpliendo · ${ind.itemsEvaluados.noCumple} no cumplen`],
    ["Documentos vencidos", ind.vencimientos.vencidos, ""],
    [`Próximos a vencer (${ind.vencimientos.umbralDias} días)`, ind.vencimientos.proximos, ""],
  ]);

  agregarHoja(libro, "Por proyecto", textoFiltros, [
    { titulo: "Código", valor: (f) => f.codigo || "", ancho: 14 },
    { titulo: "Proyecto", valor: (f) => f.nombre, ancho: 40 },
    { titulo: "Empresas", valor: (f) => f.empresas },
    { titulo: "Ítems", valor: (f) => f.items },
    { titulo: "Cumple", valor: (f) => f.cumple },
    { titulo: "No Cumple", valor: (f) => f.noCumple },
    { titulo: "Pendiente", valor: (f) => f.pendiente },
    { titulo: "No Aplica", valor: (f) => f.noAplica },
    { titulo: "% Cumple", valor: (f) => pct(f.pct), formato: "0%" },
  ], panel.porProyecto);

  agregarHoja(libro, "Por entidad", textoFiltros, [
    { titulo: "Tipo de entidad", valor: (t) => ETIQUETA_TIPO[t], ancho: 18 },
    { titulo: "Ítems", valor: (t) => panel.porTipoEntidad[t].items },
    { titulo: "Cumple", valor: (t) => panel.porTipoEntidad[t].cumple },
    { titulo: "No Cumple", valor: (t) => panel.porTipoEntidad[t].noCumple },
    { titulo: "Pendiente", valor: (t) => panel.porTipoEntidad[t].pendiente },
    { titulo: "No Aplica", valor: (t) => panel.porTipoEntidad[t].noAplica },
    { titulo: "% Cumple", valor: (t) => pct(panel.porTipoEntidad[t].pct), formato: "0%" },
  ], TIPOS_ENTIDAD);

  const { agrupacion, grupos } = panel.evolucion;
  agregarHoja(libro, "Evolución", textoFiltros, [
    { titulo: agrupacion === "mes" ? "Mes" : "Semana (inicio)", valor: (g) => (agrupacion === "mes" ? etiquetaGrupo(g.inicio, "mes") : formatFecha(g.inicio)), ancho: 16 },
    { titulo: "Cumple", valor: (g) => g.todas.cumple },
    { titulo: "No Cumple", valor: (g) => g.todas.noCumple },
    ...TIPOS_ENTIDAD.flatMap((t) => [
      { titulo: `${ETIQUETA_TIPO[t]} · Cumple`, valor: (g) => g[t].cumple, ancho: 20 },
      { titulo: `${ETIQUETA_TIPO[t]} · No Cumple`, valor: (g) => g[t].noCumple, ancho: 22 },
    ]),
  ], grupos);

  const ranking = panel.rechazos.rankings[perfilId] || [];
  const hojaRechazos = agregarHoja(libro, "Rechazos", `${textoFiltros} · Perfil: ${perfilNombre}`, [
    { titulo: "Requerimiento", valor: (f) => f.nombre || f.nombreCorto, ancho: 48 },
    { titulo: "Nombre corto", valor: (f) => f.nombreCorto || "", ancho: 24 },
    { titulo: "Tipo de entidad", valor: (f) => ETIQUETA_TIPO[f.tipoEntidad] || "", ancho: 16 },
    { titulo: "Evaluados", valor: (f) => f.evaluados },
    { titulo: "Rechazados", valor: (f) => f.rechazados },
    { titulo: "Tasa de rechazo", valor: (f) => pct(f.tasa), formato: "0%", ancho: 16 },
  ], ranking);
  if (ranking.length === 0) hojaRechazos.addRow(["Aún no hay suficientes evaluaciones para este ranking."]);

  const buffer = await libro.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `reporte-acreditacion-${hoyISO()}.xlsx`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
