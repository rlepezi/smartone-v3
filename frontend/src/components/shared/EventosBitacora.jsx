import React, { useEffect, useState } from "react";
import { describirEvento } from "../../utils/bitacoraFormatters";
import { contextoEvento } from "../../utils/bitacoraContexto";
import { useNombresBitacora } from "../../hooks/useNombresBitacora";
import { formatTiempoRelativo } from "../../utils/fechas";
import { Pagination } from "./Pagination";

// Eventos de Bitácora de una entidad (Proyecto, Empresa...). `cargar(limit)`
// devuelve la lista real del backend; `entidadId` identifica la fuente para
// recargar al cambiar. No infiere ni inventa eventos.
// Cada evento: qué pasó, el detalle (de qué empresa o proyecto a cuál), quién lo hizo y cuándo.
const ListaEventos = ({ eventos }) => {
  const nombres = useNombresBitacora();
  return (
    <ul className="divide-y divide-slate-100">
      {eventos.map((ev) => {
        const { detalle } = contextoEvento(ev, nombres);
        return (
          <li key={ev.id} className="py-2.5 text-xs">
            <p className="font-semibold text-slate-700">{describirEvento(ev)}</p>
            {detalle && <p className="text-[11px] text-slate-600">{detalle}</p>}
            <p className="text-[11px] text-slate-400">
              {formatTiempoRelativo(ev.createdAt)}
              {ev.actorNombre ? ` · por ${ev.actorNombre}` : ""}
            </p>
          </li>
        );
      })}
    </ul>
  );
};

// `undefined` mientras carga, `null` si falla.
const useEventos = (cargar, entidadId, limit) => {
  const [eventos, setEventos] = useState(undefined);

  useEffect(() => {
    let activo = true;
    cargar(limit)
      .then((data) => { if (activo) setEventos(data || []); })
      .catch(() => { if (activo) setEventos(null); });
    return () => { activo = false; };
    // `cargar` es una función inline nueva en cada render; la fuente se
    // identifica por entidadId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidadId, limit]);

  return eventos;
};

// "Últimos Eventos": los más recientes.
export const UltimosEventos = ({ cargar, entidadId, limit = 10, textoVacio = "Aún no hay eventos registrados." }) => {
  const eventos = useEventos(cargar, entidadId, limit);

  if (eventos === undefined) return <p className="text-xs text-slate-400">Cargando eventos...</p>;
  if (eventos === null) return <p className="text-xs text-red-600">No se pudieron cargar los eventos.</p>;
  if (eventos.length === 0) return <p className="text-xs text-slate-400">{textoVacio}</p>;
  return <ListaEventos eventos={eventos} />;
};

// "Historial": todos los eventos (tope del backend: 500), paginados.
export const HistorialEventos = ({ cargar, entidadId }) => {
  const eventos = useEventos(cargar, entidadId, 500);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  if (eventos === undefined) return <p className="text-xs text-slate-400 py-6 text-center">Cargando historial...</p>;
  if (eventos === null) return <p className="text-xs text-red-600 py-6 text-center">No se pudo cargar el historial.</p>;
  if (eventos.length === 0) return <p className="text-xs text-slate-400 py-6 text-center">Aún no hay eventos registrados.</p>;

  const visibles = eventos.slice((page - 1) * pageSize, page * pageSize);
  return (
    <div className="space-y-4">
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card">
        <ListaEventos eventos={visibles} />
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={eventos.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
      />
    </div>
  );
};
