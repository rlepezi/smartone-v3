import { formatFecha, hoyISO } from "./fechas";
import { formatRutDisplay } from "./rutFormatters";

// Texto legible de una regla de validación (no el JSON de sus parámetros), con los datos reales de
// lo que se evalúa. `regla`: { tipo, verificacion, parametros, instruccionIA, nombre } (pauta del
// requerimiento). `ctx`: { tipoEntidad, sujeto (persona o recurso), empresa, proyecto }.
// Las verificaciones son las de functions/src/reglasIA/verificaciones/index.js.
const nombrePersona = (p) => `${p?.nombre || ""} ${p?.apellido || ""}`.trim();
const rut = (v) => (v ? formatRutDisplay(v) : null);

export const describirRegla = (regla, ctx = {}) => {
  if (regla.tipo !== "deterministica") return regla.instruccionIA || regla.nombre;
  const p = regla.parametros || {};
  const { tipoEntidad, sujeto, empresa, proyecto } = ctx;
  const rutEvaluado = tipoEntidad === "empresa" ? rut(empresa?.rut) : rut(sujeto?.rut);
  switch (regla.verificacion) {
    case "coincide_rut":
      return rutEvaluado ? `RUT debe coincidir con ${rutEvaluado}` : "RUT debe coincidir con el de lo evaluado";
    case "coincide_nombre": {
      const modo = p.tolerancia === "estricta" ? "idéntico" : "por palabras, sin importar el orden";
      const nombre = nombrePersona(sujeto);
      return nombre ? `Nombre debe coincidir con ${nombre} (${modo})` : `Nombre debe coincidir con el de la persona (${modo})`;
    }
    case "vigente_a_fecha":
      return `Vigente a la fecha de evaluación (${formatFecha(hoyISO())})${p.diasMargen ? `, con ${p.diasMargen} días de margen` : ""}`;
    case "vigente_hasta_fin_proyecto": {
      const termino = proyecto?.fechaTerminoReprogramada || proyecto?.fechaTermino || null;
      return termino ? `Vigente hasta el término del proyecto (${formatFecha(termino)})` : "Vigente hasta el término del proyecto (sin fecha de término registrada)";
    }
    case "antiguedad_maxima":
      return `Emisión con antigüedad máxima de ${p.diasMaximos} días`;
    case "campo_presente":
      return `El documento debe traer el campo «${p.campo}»`;
    case "clases_aceptadas":
      return `Clase de licencia aceptada: ${(p.clases || []).join(", ") || "—"}`;
    case "coincide_patente":
      return sujeto?.patente ? `Patente debe coincidir con ${sujeto.patente}` : "Patente debe coincidir con la del recurso";
    case "archivo_presente":
      return "El documento debe estar presentado";
    case "carpeta_presente":
      return p.nombres?.length
        ? `El documento debe estar en la carpeta ${p.nombres.join(" o ")}`
        : "El documento debe venir de la carpeta del repositorio";
    case "campo_valor": {
      const valores = (p.valores || []).join(" o ") || "—";
      return `«${p.campo}» ${p.modo === "contiene" ? "debe contener" : "debe ser"} ${valores}`;
    }
    case "coincide_empresa":
      return empresa?.rut
        ? `Empleador debe ser ${empresa.razonSocial || "la empresa"} (${rut(empresa.rut)})`
        : "Empleador debe ser la empresa del expediente";
    default:
      return regla.nombre;
  }
};
