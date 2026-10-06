// Opciones de los selectores de Proyecto. El backend NO las valida contra un
// catálogo fijo (mismo criterio que Recurso.tipo): guarda el texto elegido. Son
// listas iniciales, editables acá sin tocar el backend; un valor guardado que
// ya no esté en la lista se sigue mostrando (ver SelectorCatalogo).

export const REGIONES_CHILE = [
  "Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama", "Coquimbo",
  "Valparaíso", "Metropolitana de Santiago", "O'Higgins", "Maule", "Ñuble",
  "Biobío", "La Araucanía", "Los Ríos", "Los Lagos", "Aysén", "Magallanes",
];

export const TIPOS_PROYECTO = [
  "Construcción", "Montaje", "Mantención", "Operación", "Ingeniería",
  "Servicios", "Otro",
];

export const CATEGORIAS_PROYECTO = [
  "Estratégico", "Operacional", "Mantención mayor", "Mantención menor",
  "Contingencia",
];

export const AREAS_NEGOCIO = [
  "Minería", "Energía", "Infraestructura", "Industrial", "Servicios", "Otra",
];

export const TIPOS_CONTRATO_PROYECTO = [
  "Suma alzada", "Precios unitarios", "Administración delegada",
  "Por servicio", "Otro",
];

export const MONEDAS = ["CLP", "UF", "USD", "EUR"];
