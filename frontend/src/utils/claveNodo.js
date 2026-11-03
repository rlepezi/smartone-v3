// Clave de los nodos de la plantilla de estructura (Mapeo documental).

// Clave de un nodo nuevo, generada desde el nombre (minúsculas, números y _) y única entre las ya
// usadas, incluidas las de nodos retirados (una clave retirada no se reutiliza). Luego es inmutable.
export const claveDesdeNombre = (nombre, usadas) => {
  const base = String(nombre || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 36) || "nodo";
  const raiz = base.length < 2 ? `${base}_x` : base;
  let clave = raiz;
  for (let n = 2; usadas.includes(clave); n++) clave = `${raiz}_${n}`;
  return clave;
};
