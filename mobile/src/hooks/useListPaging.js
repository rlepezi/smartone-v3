import { useMemo, useState } from "react";

// La API no expone paginación por cursor en ninguno de los list()
// confirmados en la auditoría Fase A (solo filtros por estado/empresaId/
// mandanteId) ni búsqueda server-side — se pagina y filtra en memoria
// sobre la respuesta completa, página a página con "Cargar más" (mismo
// gap ya documentado). PAGE_SIZE arbitrario, ajustable si se nota lento.
const PAGE_SIZE = 20;

export function useListPaging(items) {
  const [pagina, setPagina] = useState(1);
  const visibles = useMemo(
      () => items.slice(0, pagina * PAGE_SIZE),
      [items, pagina],
  );
  const hayMas = visibles.length < items.length;
  return { visibles, hayMas, cargarMas: () => setPagina((p) => p + 1) };
}
