// Tarjeta blanca de una sección de Configuración IA.
export const Tarjeta = ({ titulo, Icono, acciones = null, subtitulo = null, children }) => (
  <section className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <div className="mr-auto min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-bold text-carbon-dark">
          {Icono && <Icono className="w-4 h-4 text-primary" />} {titulo}
        </h2>
        {subtitulo && <p className="mt-0.5 text-[11px] text-slate-500">{subtitulo}</p>}
      </div>
      {acciones}
    </div>
    {children}
  </section>
);
