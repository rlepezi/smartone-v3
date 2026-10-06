// Sin catálogo propio en el sistema: listas fijas de valores comunes de la relación laboral de
// una Persona (solo rellenan el campo, que sigue siendo de texto libre). Única fuente para todas
// las pantallas (modal del wizard, Nueva Persona, Cambiar Empresa).
export const SUGERENCIAS_TIPO_RELACION_PERSONA = ["Trabajador", "Subcontratista", "Prestador de Servicios"];
export const SUGERENCIAS_TIPO_CONTRATO = ["Indefinido", "Plazo Fijo", "Por Obra o Faena"];
// Tipo de Relación de una Maquinaria con su Empresa.
export const SUGERENCIAS_TIPO_RELACION_RECURSO = ["Propietario", "Arrendatario", "Comodato"];
export const SUGERENCIAS_JORNADA = ["Diurna", "Nocturna", "Turnos", "Part-Time"];
// Tipo Maquinaria del alta rápida (ModalCrearRecurso, wizard de Nueva Acreditación) — lista fija
// acotada, distinta del catálogo Perfil de Recurso configurable por Mandante (ese sigue siendo la
// fuente de verdad para la validación al asignar la Maquinaria a un Proyecto).
export const SUGERENCIAS_TIPO_MAQUINARIA = ["Camioneta", "Grúa", "Camión", "Minibus", "STATION WAGON"];
