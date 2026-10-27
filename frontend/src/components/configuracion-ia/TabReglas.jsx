import { useEffect, useState } from "react";
import { ListChecks, Pencil, Plus, Search } from "lucide-react";
import { reglaIAService } from "../../services/reglaIAService";
import { ErrorBanner } from "../shared/ErrorBanner";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { ENTIDADES_IA, TIPOS_REGLA, etiquetaEntidad } from "../../utils/reglasIA";
import { Tarjeta } from "./Tarjeta";
import { ReglaModal } from "./ReglaModal";
import { CLASE_INPUT, CLASE_PRIMARIO } from "./estilos";

const CLASE_BADGE = "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap";

// Pestaña "Reglas de revisión" (solo superadmin): biblioteca reutilizable de reglas para la revisión
// IA de los requerimientos. Filtros por tipo, entidad y estado, buscador, y crear / editar / activar.
export const TabReglas = () => {
  const [reglas, setReglas] = useState(null);
  const [verificaciones, setVerificaciones] = useState([]);
  const [filtros, setFiltros] = useState({ tipo: "", entidad: "", estado: "" });
  const [texto, setTexto] = useState("");
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [editando, setEditando] = useState(null); // regla | "nueva"
  const [desactivando, setDesactivando] = useState(null);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [cobertura, setCobertura] = useState(null);

  useEffect(() => {
    let vigente = true;
    reglaIAService.verificaciones().then((v) => { if (vigente) setVerificaciones(v || []); }).catch(() => {});
    reglaIAService.cobertura().then((c) => { if (vigente) setCobertura(c || null); }).catch(() => {});
    return () => { vigente = false; };
  }, []);

  useEffect(() => {
    let vigente = true;
    reglaIAService.listar(filtros)
      .then((lista) => { if (vigente) { setReglas(lista || []); setError(null); } })
      .catch((err) => { if (vigente) setError(err.message || "No se pudieron cargar las reglas."); });
    return () => { vigente = false; };
  }, [filtros, recarga]);

  const recargar = () => setRecarga((n) => n + 1);
  const cambiarEstado = async (regla, estado) => {
    setCambiandoEstado(true);
    setError(null);
    try {
      const r = await reglaIAService.cambiarEstado(regla.id, estado);
      setAviso(estado === "inactiva" && r.uso > 0
        ? `Regla desactivada. ${r.uso} ${r.uso === 1 ? "requerimiento la usa y quedará" : "requerimientos la usan y quedarán"} con una alerta.`
        : `Regla ${estado === "activa" ? "activada" : "desactivada"}.`);
      setDesactivando(null);
      recargar();
    } catch (err) {
      setError(err.message || "No se pudo cambiar el estado.");
    } finally {
      setCambiandoEstado(false);
    }
  };

  const t = texto.trim().toLowerCase();
  const visibles = (reglas || []).filter((r) => !t || `${r.nombre} ${r.descripcion || ""}`.toLowerCase().includes(t));
  const filtro = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));
  // Cobertura de la entidad filtrada (o de todas).
  const cob = cobertura && Object.entries(cobertura)
    .filter(([e]) => !filtros.entidad || e === filtros.entidad)
    .reduce((s, [, c]) => ({ total: s.total + c.total, habilitados: s.habilitados + c.habilitados }), { total: 0, habilitados: 0 });

  return (
    <Tarjeta titulo="Reglas de revisión" Icono={ListChecks} acciones={(
      <button type="button" onClick={() => setEditando("nueva")} className={CLASE_PRIMARIO}><Plus className="w-4 h-4" /> Nueva regla</button>
    )}>
      <p className="text-xs text-slate-500">
        Biblioteca reutilizable. Cada requerimiento elige sus reglas y define su severidad y parámetros. La IA solo propone; el evaluador siempre confirma.
      </p>
      {cob && (
        <p className="text-xs text-slate-600">
          <span className="font-bold text-carbon-dark">{cob.habilitados} de {cob.total}</span> requerimientos activos
          {filtros.entidad ? ` de ${etiquetaEntidad(filtros.entidad)}` : ""} con IA habilitada.
        </p>
      )}
      <ErrorBanner message={error} />
      {aviso && <p className="text-xs text-sage-dark font-semibold">{aviso}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[14rem]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre o descripción" aria-label="Buscar reglas" className={`${CLASE_INPUT} pl-8`} />
        </label>
        <select aria-label="Tipo" value={filtros.tipo} onChange={filtro("tipo")} className={`${CLASE_INPUT} w-auto`}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_REGLA).map(([v, x]) => <option key={v} value={v}>{x.label}</option>)}
        </select>
        <select aria-label="Entidad" value={filtros.entidad} onChange={filtro("entidad")} className={`${CLASE_INPUT} w-auto`}>
          <option value="">Todas las entidades</option>
          {ENTIDADES_IA.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
        <select aria-label="Estado" value={filtros.estado} onChange={filtro("estado")} className={`${CLASE_INPUT} w-auto`}>
          <option value="">Activas e inactivas</option>
          <option value="activa">Activas</option>
          <option value="inactiva">Inactivas</option>
        </select>
      </div>

      {!reglas ? <p className="py-6 text-center text-xs text-slate-400">Cargando reglas...</p> : visibles.length === 0 ? (
        <div className="py-8 text-center space-y-2">
          <p className="text-xs text-slate-500">{reglas.length ? "Ninguna regla coincide con la búsqueda." : "Aún no hay reglas en la biblioteca."}</p>
          {!reglas.length && <button type="button" onClick={() => setEditando("nueva")} className={CLASE_PRIMARIO}><Plus className="w-4 h-4" /> Crear la primera regla</button>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[48rem] text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-3 py-2.5">Nombre</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Entidades</th>
                <th className="px-3 py-2.5">Uso</th>
                <th className="px-3 py-2.5 text-right">Versión</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((r) => (
                <tr key={r.id} className={r.estado === "activa" ? "" : "opacity-60"}>
                  <td className="px-3 py-2.5">
                    <p className="font-bold text-carbon-dark">{r.nombre}</p>
                    {r.descripcion && <p className="text-[11px] text-slate-500 line-clamp-1">{r.descripcion}</p>}
                  </td>
                  <td className="px-3 py-2.5"><span className={`${CLASE_BADGE} ${TIPOS_REGLA[r.tipo]?.clase || ""}`}>{TIPOS_REGLA[r.tipo]?.label || r.tipo}</span></td>
                  <td className="px-3 py-2.5 text-slate-600">{(r.entidades || []).map(etiquetaEntidad).join(", ")}</td>
                  <td className="px-3 py-2.5 text-slate-600">{r.uso ? `Usada en ${r.uso} ${r.uso === 1 ? "requerimiento" : "requerimientos"}` : "Sin uso"}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">v{r.version}</td>
                  <td className="px-3 py-2.5">
                    <span className={`${CLASE_BADGE} ${r.estado === "activa" ? "bg-sage-lighter text-sage-darker border-sage-light" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                      {r.estado === "activa" ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => setEditando(r)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-primary hover:bg-primary-lighter">
                      <Pencil className="w-3 h-3" /> Editar
                    </button>
                    <button type="button" disabled={cambiandoEstado}
                      onClick={() => (r.estado === "activa" ? setDesactivando(r) : cambiarEstado(r, "activa"))}
                      className="px-2 py-1 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                      {r.estado === "activa" ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <ReglaModal
          regla={editando === "nueva" ? null : editando}
          verificaciones={verificaciones}
          onCerrar={() => setEditando(null)}
          onGuardada={(r, accion) => {
            setEditando(null);
            setAviso(accion === "duplicar" ? `Regla duplicada: «${r.nombre}».` : `Regla «${r.nombre}» guardada (versión ${r.version}).`);
            recargar();
          }}
        />
      )}
      {desactivando && (
        <ConfirmacionModal
          peligro={desactivando.uso > 0}
          titulo={`Desactivar «${desactivando.nombre}»`}
          mensaje={desactivando.uso > 0
            ? `Esta regla se usa en ${desactivando.uso} ${desactivando.uso === 1 ? "requerimiento" : "requerimientos"}: quedarán marcados con una alerta. Puede reactivarla cuando quiera.`
            : "La regla no se usará en nuevas configuraciones. Puede reactivarla cuando quiera."}
          textoConfirmar="Desactivar"
          ocupado={cambiandoEstado}
          onConfirmar={() => cambiarEstado(desactivando, "inactiva")}
          onCancelar={() => setDesactivando(null)}
        />
      )}
    </Tarjeta>
  );
};
