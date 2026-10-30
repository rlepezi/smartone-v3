// Grupo "Aplica a" de un Requerimiento de Persona o Maquinaria: pill "Todos" + una pill por Perfil
// de Recurso activo del Mandante y del tipo. "Todos" y las pills específicas son excluyentes;
// entre específicas se pueden marcar varias. Lo usan el modal de Requerimiento (RequerimientoModal)
// y el panel de configuración del Perfil de Participación.
//  - `perfiles`: [{ id, nombre }] Perfiles de Recurso disponibles.
//  - `valor`: null ("Todos") o arreglo de perfilRecursoId.
//  - `onChange(nuevoValor)`: recibe null o un arreglo no vacío.
//  - `permiteVacio`: el grupo puede quedar sin ninguna pill marcada (`valor` undefined), para
//    formularios que exigen elegir explícitamente; al desmarcar la última específica avisa
//    `onChange(undefined)` en vez de volver a "Todos".
export const AplicaAPills = ({
  perfiles = [], valor, onChange, disabled = false, compacto = false, permiteVacio = false,
}) => {
  const esTodos = permiteVacio ? valor === null : (!valor || valor.length === 0);
  const especificos = Array.isArray(valor) ? valor : [];

  const alternarPerfil = (id) => {
    const nuevos = especificos.includes(id) ? especificos.filter((x) => x !== id) : [...especificos, id];
    if (nuevos.length > 0) onChange(nuevos);
    else onChange(permiteVacio ? undefined : null);
  };

  const clasePill = (activo) => `${compacto ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]"} rounded-full font-semibold border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
    activo ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
  }`;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        aria-pressed={esTodos}
        disabled={disabled}
        onClick={() => onChange(null)}
        className={clasePill(esTodos)}
      >
        Todos
      </button>
      {perfiles.map((p) => {
        const activo = !esTodos && especificos.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={activo}
            disabled={disabled}
            onClick={() => alternarPerfil(p.id)}
            className={clasePill(activo)}
          >
            {p.nombre}
          </button>
        );
      })}
    </div>
  );
};
