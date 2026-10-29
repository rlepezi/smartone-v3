// Mapas de etiquetas: espejo manual de los catálogos de sus respectivos
// services de backend (fuente única de verdad), usados solo para
// traducir el `detalle` de un evento de bitácora a texto legible.
const ESTADO_PROYECTO_LABELS = {
  planificado: "Planificado",
  en_ejecucion: "En Ejecución",
  suspendido: "Suspendido",
  finalizado: "Finalizado",
  archivado: "Archivado",
};

const ESTADO_EXPEDIENTE_LABELS = {
  creado: "Creado",
  preparacion_documental: "Preparación Documental",
  en_revision: "En Revisión",
  con_observaciones: "Con Observaciones",
  en_correccion: "En Corrección",
  reevaluacion: "Reevaluación",
  aprobado: "Aprobado",
  en_ejecucion: "En ejecución",
  completado: "Completado",
  completado_pendientes: "Completado con pendientes",
  cerrado: "Cerrado",
};

const RESULTADO_EVALUACION_LABELS = {
  cumple: "Cumple",
  no_cumple: "No Cumple",
  no_aplica: "No Aplica",
  pendiente: "Pendiente",
};

const CAMPO_USUARIO_LABELS = {
  rol: "rol",
  mandanteId: "mandante",
  estado: "estado",
};

const CAMPO_PERFIL_LABELS = {
  nombre: "nombre",
  descripcion: "descripción",
};

const CAMPO_RECURSO_LABELS = {
  nombre: "nombre",
  tipo: "tipo",
  empresaId: "empresa",
  patente: "patente",
  marca: "marca",
  modelo: "modelo",
  anio: "año",
};

const ETIQUETA_ENTIDAD = {
  persona: "Persona",
  empresa: "Empresa",
  recurso: "Maquinaria",
  evidencia: "Evidencia",
  mandante: "Mandante",
  proyecto: "Proyecto",
};

// Describe un registro de bitácora ({ entidad, accion, detalle }) como un
// texto legible en español, para el panel "Actividad Reciente" del
// Dashboard y el historial de detalle de Expediente.
export const describirEvento = (registro) => {
  const { entidad, accion, detalle } = registro || {};

  if (entidad === "expediente") {
    if (accion === "creado") return "Expediente creado";
    if (accion === "transicion_estado") {
      const nuevo = ESTADO_EXPEDIENTE_LABELS[detalle?.estadoNuevo] || detalle?.estadoNuevo;
      return `Expediente transicionado a ${nuevo}`;
    }
    if (accion === "inicio_faena") return "Inicio en faena registrado";
    if (accion === "inicio_faena_quitado") return "Inicio en faena quitado (corrección)";
    if (accion === "requerimiento_agregado") return "Requerimiento agregado al Expediente";
    if (accion === "requerimiento_quitado") return "Requerimiento quitado del Expediente";
    if (accion === "repositorio_documental_actualizado") {
      if (!detalle?.nuevo) return "Documentación desvinculada";
      if (detalle?.anterior && detalle.anterior.etiqueta === detalle.nuevo.etiqueta) return "Mapeo de carpetas actualizado";
      return `Documentación vinculada: «${detalle.nuevo.etiqueta}»`;
    }
    if (accion === "carpeta_sujeto_actualizada") {
      const sujeto = detalle?.tipo === "recurso" ? "maquinaria" : "persona";
      return detalle?.nuevo ? `Carpeta de ${sujeto} asignada: «${detalle.nuevo}»` : `Carpeta de ${sujeto} quitada`;
    }
    if (accion === "carpeta_empresa_vinculada") return `Carpeta de empresa vinculada: «${detalle?.ruta || ""}»`;
    if (accion === "carpeta_empresa_desvinculada") return "Carpeta de empresa desvinculada";
    if (accion === "revision_ia_configurada") return "Revisiones IA configuradas";
    if (accion === "revision_ia_aceptar_lote") return "Propuestas IA aceptadas en lote";
  }

  if (entidad === "carpetasEmpresa") {
    if (accion === "creado") return `Carpeta de empresa creada: «${detalle?.ruta || ""}»`;
    if (accion === "actualizado") return "Mapeo de la carpeta de empresa actualizado";
  }

  if (entidad === "fuentesDocumentales") {
    if (accion === "creado") return `Fuente documental creada: «${detalle?.nombre || ""}»`;
    if (accion === "actualizado") return "Fuente documental actualizada";
    if (accion === "transicion_estado") return detalle?.estadoNuevo === "activa" ? "Fuente documental activada" : "Fuente documental desactivada";
  }

  if (entidad === "evaluacion" && accion === "creado") {
    const resultado = RESULTADO_EVALUACION_LABELS[detalle?.resultado] || detalle?.resultado;
    return `Nueva evaluación: ${resultado}`;
  }

  if (entidad === "participacionPersona" || entidad === "participacionRecurso") {
    const sujeto = entidad === "participacionPersona" ? "Persona" : "Maquinaria";
    if (accion === "creado") return `${sujeto} asignada al Proyecto`;
    if (accion === "transicion_estado") {
      if (detalle?.estadoNuevo === "finalizada") return `${sujeto} quitada del Proyecto`;
      if (detalle?.estadoNuevo === "activa" && detalle?.estadoAnterior === "pendiente") {
        return `${sujeto} activada en el Proyecto`;
      }
      return `${sujeto}: estado ${detalle?.estadoNuevo}`;
    }
    if (accion === "reemplazo_acreditacion") return `${sujeto} cambiada de Proyecto o Empresa`;
  }

  if (entidad === "participacion") {
    if (accion === "creado") return "Participación creada";
    if (accion === "transicion_estado") {
      if (detalle?.estadoNuevo === "finalizada") return "Participación finalizada";
      if (detalle?.estadoNuevo === "suspendida") return "Participación suspendida";
      if (detalle?.estadoNuevo === "activa" && detalle?.estadoAnterior === "suspendida") {
        return "Participación reactivada";
      }
      if (detalle?.estadoNuevo === "activa" && detalle?.estadoAnterior === "pendiente") {
        return "Participación activada";
      }
      return `Participación transicionada a ${detalle?.estadoNuevo}`;
    }
    if (accion === "reemplazo_acreditacion") return "Participación reemplazada";
  }

  if (entidad === "proyecto" && accion === "transicion_estado") {
    const nuevo = ESTADO_PROYECTO_LABELS[detalle?.estadoNuevo] || detalle?.estadoNuevo;
    return `Proyecto transicionado a ${nuevo}`;
  }

  if (entidad === "persona") {
    if (accion === "cambio_empresa") return "Persona cambió de Empresa";
    if (accion === "relacion_terminada") return "Persona terminó su relación con la Empresa";
    if (accion === "anonimizacion_persona") return "Persona anonimizada";
  }

  if (entidad === "empresa") {
    if (accion === "asociada_mandante") return "Empresa asociada al Mandante";
    if (accion === "desasociada_mandante") return "Empresa desasociada del Mandante";
  }

  if (entidad === "expediente" && accion === "instancias_sincronizadas") {
    return "Requerimientos del Expediente actualizados";
  }

  if (entidad === "evidencia") {
    if (accion === "cancelacion_purga_evidencia") return "Purga de documento cancelada";
    if (accion === "purga_documento_identidad") return "Documento de identidad purgado";
  }

  if (entidad === "recurso") {
    if (accion === "creado") return "Maquinaria creada";
    if (accion === "cambio_empresa") return "Maquinaria cambió de Empresa";
    if (accion === "relacion_terminada") return "Maquinaria terminó su relación con la Empresa";
    if (accion === "transicion_estado") {
      return detalle?.estadoNuevo === "inactivo"
        ? "Maquinaria desactivada"
        : "Maquinaria activada";
    }
    if (accion === "actualizado") {
      const campos = Object.keys(detalle || {}).map((c) => CAMPO_RECURSO_LABELS[c] || c);
      return campos.length
        ? `Maquinaria actualizada (${campos.join(", ")})`
        : "Maquinaria actualizada";
    }
  }

  if (entidad === "usuario") {
    if (accion === "creado") return "Usuario creado";
    if (accion === "actualizado") {
      const campos = Object.keys(detalle || {}).map((c) => CAMPO_USUARIO_LABELS[c] || c);
      return campos.length ? `Usuario actualizado (${campos.join(", ")})` : "Usuario actualizado";
    }
    if (accion === "reset_password_solicitado") return "Restablecimiento de contraseña solicitado";
    if (accion === "sesiones_revocadas") return "Sesiones revocadas";
  }

  if (entidad === "perfil_recurso") {
    if (accion === "creado") return "Perfil de Recurso creado";
    if (accion === "transicion_estado") {
      return detalle?.estadoNuevo === "inactivo"
        ? "Perfil de Recurso desactivado"
        : "Perfil de Recurso activado";
    }
    if (accion === "actualizado") return "Perfil de Recurso actualizado";
  }

  if (entidad === "requerimiento") {
    if (accion === "creado") return "Requerimiento creado";
    if (accion === "transicion_estado") {
      return detalle?.estadoNuevo === "inactivo" ? "Requerimiento desactivado" : "Requerimiento activado";
    }
    if (accion === "actualizado") return "Requerimiento actualizado";
  }

  if (entidad === "perfil_participacion") {
    if (accion === "creado") return "Perfil de Participación creado";
    if (accion === "transicion_estado") {
      return detalle?.estadoNuevo === "inactivo"
        ? "Perfil de Participación desactivado"
        : "Perfil de Participación activado";
    }
    if (accion === "actualizado") {
      const campos = Object.keys(detalle || {}).map((c) => CAMPO_PERFIL_LABELS[c] || c);
      return campos.length
        ? `Perfil de Participación actualizado (${campos.join(", ")})`
        : "Perfil de Participación actualizado";
    }
  }

  // Altas, ediciones y cambios de estado genéricos de cualquier entidad.
  const etiqueta = ETIQUETA_ENTIDAD[entidad];
  if (etiqueta) {
    if (accion === "creado") return `${etiqueta} registrada`;
    if (accion === "actualizado") return `${etiqueta} actualizada`;
    if (accion === "transicion_estado" && detalle?.estadoNuevo) return `${etiqueta}: estado ${detalle.estadoNuevo}`;
  }

  // Cualquier combinación entidad/acción no cubierta arriba usa un label
  // genérico — nunca se muestra el enum crudo "entidad — accion" en la UI.
  // Se avisa por consola solo en desarrollo, para detectar el hueco en el
  // mapa sin generar ruido en producción.
  if (import.meta.env.DEV) {
    console.warn(`describirEvento: combinación sin mapear "${entidad} — ${accion}"`, registro);
  }
  return "Actividad registrada";
};
