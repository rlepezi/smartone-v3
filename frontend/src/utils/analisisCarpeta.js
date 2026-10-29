// Último análisis de estructura de la carpeta del expediente (Revisiones IA → paso 1, o "Reanalizar"
// del panel de documentos), reducido a lo que necesita el panel para ubicar los documentos de cada
// requerimiento: la carpeta de cada sección y los archivos calzados con cada documento. Se guarda
// SOLO en este navegador (la carpeta local también es de este navegador); nunca va al servidor.

const clave = (usuarioId, expedienteId) => `smartone:analisisCarpeta:${usuarioId}:${expedienteId}`;

// Índice desde el plan del análisis: { secciones: { seccionClave: rutaCarpeta },
// documentos: { "<entidadCarpeta>|<documentoClave>": [nombres de archivo] } }. A nivel Empresa la
// entidadCarpeta es "".
export const indiceDePlan = (plan) => {
  const empresa = (plan?.empresas || []).find((e) => !e.esSubcontrato) || plan?.empresas?.[0];
  const secciones = {};
  const documentos = {};
  (empresa?.secciones || []).forEach((s) => {
    if (s.seccionClave && s.seccionCarpeta && !s.entidadCarpeta && !secciones[s.seccionClave]) {
      secciones[s.seccionClave] = s.seccionCarpeta;
    }
    (s.calceArchivos || []).forEach((c) => {
      if (!c.documentoClave) return;
      const k = `${s.entidadCarpeta || ""}|${c.documentoClave}`;
      documentos[k] = [...(documentos[k] || []), c.nombre];
    });
  });
  return { secciones, documentos };
};

// { fecha (ISO), carpeta, indice } o null. Sin almacenamiento disponible devuelve null.
export const leerAnalisis = (usuarioId, expedienteId) => {
  if (!usuarioId || !expedienteId) return null;
  try {
    const valor = JSON.parse(localStorage.getItem(clave(usuarioId, expedienteId)) || "null");
    return valor?.indice ? valor : null;
  } catch {
    return null;
  }
};

export const guardarAnalisis = (usuarioId, expedienteId, carpeta, plan) => {
  const valor = { fecha: new Date().toISOString(), carpeta, indice: indiceDePlan(plan) };
  try {
    localStorage.setItem(clave(usuarioId, expedienteId), JSON.stringify(valor));
  } catch {
    // Sin almacenamiento: el panel queda sin análisis (muestra la raíz).
  }
  return valor;
};

// Carpeta (ruta relativa) de una ubicación por estructura: la de la primera sección analizada.
export const rutaDeUbicacion = (ubicacion, analisis) => {
  if (!analisis || !["plantilla", "tipo"].includes(ubicacion?.nivel)) return null;
  for (const d of ubicacion.documentos || []) {
    const ruta = analisis.indice.secciones[d.seccionClave];
    if (ruta) return ruta;
  }
  return null;
};

// Nombres de los archivos de una ubicación dentro de una carpeta de entidad ("" = Empresa).
export const archivosDeUbicacion = (ubicacion, analisis, entidadCarpeta = "") => {
  if (!analisis || !["plantilla", "tipo"].includes(ubicacion?.nivel)) return [];
  return (ubicacion.documentos || []).flatMap((d) =>
    (d.documentoClave ? analisis.indice.documentos[`${entidadCarpeta || ""}|${d.documentoClave}`] || [] : []));
};
