import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { CLASE_BADGE } from "../../../utils/revisionIA";
import { CLASE_PRIMARIO, GRUPO_TEXTO, NIVEL_TEXTO } from "./estilos";

const ESTADO_IA = { piloto: "Piloto", activo: "Activo", no_normalizado: "No normalizado" };

// Dónde se corrige cada motivo de no elegibilidad.
const ENLACE_MOTIVO = {
  sin_tipo: { to: "/requerimientos", texto: "Ir a Requerimientos" },
  tipo_inactivo: { to: "/configuracion/ia?tab=tipos", texto: "Ir a Tipos documentales" },
  no_en_plantilla: { to: "/configuracion/ia?tab=estructura", texto: "Ir a Estructura de carpetas" },
  documento_deshabilitado: { to: "/configuracion/ia?tab=estructura", texto: "Ir a Estructura de carpetas" },
  dato_sensible: { to: "/configuracion/ia?tab=estructura", texto: "Ir a Estructura de carpetas" },
};

const Switch = ({ activo, deshabilitado, onChange, etiqueta }) => (
  <button
    type="button" role="switch" aria-checked={activo} aria-label={etiqueta} disabled={deshabilitado} onClick={onChange}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed ${activo ? "bg-primary" : "bg-slate-300"}`}
  >
    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${activo ? "translate-x-4" : "translate-x-0.5"}`} />
  </button>
);

// Bloque 2 "Requerimientos a revisar con IA": los requerimientos del expediente agrupados por
// nivel, con su elegibilidad (cadena requerimiento → tipo documental → plantilla) y el switch para
// habilitarlos en este expediente. Solo los elegibles se pueden activar.
export const BloqueRequerimientos = ({ requerimientos, resumen, puedeEditar, puedeConfigurar, onGuardar }) => {
  const inicial = requerimientos.filter((r) => r.habilitadoIA).map((r) => r.requerimientoId);
  const [seleccion, setSeleccion] = useState(() => new Set(inicial));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const cambiado = seleccion.size !== inicial.length || inicial.some((id) => !seleccion.has(id));

  const alternar = (id) => setSeleccion((s) => {
    const nuevo = new Set(s);
    if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id);
    return nuevo;
  });

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await onGuardar({ requerimientosIA: [...seleccion] });
    } catch (err) {
      setError(err.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  if (!requerimientos.length) {
    return <p className="py-4 text-center text-xs text-slate-400">El expediente aún no tiene requerimientos.</p>;
  }

  const grupos = ["empresa", "persona", "recurso"]
    .map((nivel) => ({ nivel, items: requerimientos.filter((r) => r.tipoEntidad === nivel) }))
    .filter((g) => g.items.length);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-slate-600 mr-auto">
          <b>{resumen.elegibles}</b> de {resumen.total} requerimientos elegibles · <b>{seleccion.size}</b> {seleccion.size === 1 ? "habilitado" : "habilitados"}
        </p>
        {puedeEditar && (
          <button type="button" onClick={guardar} disabled={!cambiado || guardando} className={CLASE_PRIMARIO}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {resumen.elegibles === 0 && (
        <p className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
          Para revisar con IA, el requerimiento necesita un tipo documental, ese tipo debe estar activo (piloto o activo) y la plantilla debe tener un documento habilitado de ese tipo.
          {puedeConfigurar && (
            <span className="block mt-1.5 space-x-3">
              <Link to="/requerimientos" className="font-bold text-primary hover:underline">Requerimientos</Link>
              <Link to="/configuracion/ia?tab=tipos" className="font-bold text-primary hover:underline">Tipos documentales</Link>
              <Link to="/configuracion/ia?tab=estructura" className="font-bold text-primary hover:underline">Estructura de carpetas</Link>
            </span>
          )}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-left text-xs">
          <thead>
            <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="px-3 py-2">Revisar con IA</th>
              <th className="px-3 py-2">Requerimiento</th>
              <th className="px-3 py-2">Nivel</th>
              <th className="px-3 py-2">Tipo documental</th>
              <th className="px-3 py-2">Documento en plantilla</th>
              <th className="px-3 py-2">Elegibilidad</th>
            </tr>
          </thead>
          {grupos.map((g) => (
            <tbody key={g.nivel} className="divide-y divide-slate-100">
              <tr><td colSpan={6} className="px-3 pt-3 pb-1 text-[11px] font-bold text-slate-500">{GRUPO_TEXTO[g.nivel]}</td></tr>
              {g.items.map((r) => {
                const enlace = ENLACE_MOTIVO[r.motivo];
                return (
                  <tr key={r.requerimientoId} className={r.elegible ? "" : "text-slate-400"}>
                    <td className="px-3 py-2">
                      <Switch
                        activo={seleccion.has(r.requerimientoId)} deshabilitado={!puedeEditar || !r.elegible}
                        onChange={() => alternar(r.requerimientoId)} etiqueta={`Revisar ${r.nombre} con IA`}
                      />
                    </td>
                    <td className="px-3 py-2 font-semibold text-carbon-dark">{r.nombre}</td>
                    <td className="px-3 py-2">{NIVEL_TEXTO[r.tipoEntidad] || r.tipoEntidad}</td>
                    <td className="px-3 py-2">
                      {r.tipo ? (
                        <span className={`${CLASE_BADGE} bg-primary-lighter text-primary-dark border-primary/20`}>
                          {r.tipo.codigo} · {r.tipo.estado === "activo" ? ESTADO_IA[r.tipo.estadoIA] || r.tipo.estadoIA : "Inactivo"}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2">{r.documentoPlantilla ? `${r.documentoPlantilla.nombre} · ${r.documentoPlantilla.seccion}` : "—"}</td>
                    <td className="px-3 py-2">
                      {r.elegible ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-sage-dark"><CheckCircle2 className="w-3.5 h-3.5" /> Elegible</span>
                      ) : (
                        <span className="text-slate-500">
                          {r.motivoTexto}
                          {puedeConfigurar && enlace && <> · <Link to={enlace.to} className="font-bold text-primary hover:underline">{enlace.texto}</Link></>}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
};
