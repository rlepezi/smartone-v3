import React, { useEffect, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { ChevronDown, ChevronRight, Link2 } from "lucide-react";
import { mandanteService } from "../../services/mandanteService";
import { perfilRecursoService } from "../../services/perfilRecursoService";
import { SelectConBusqueda } from "../shared/SelectConBusqueda";
import { AplicaAPills } from "./AplicaAPills";

// Sección "Vincular a Perfiles de Participación" del formulario de Requerimiento.
// El Requerimiento es un catálogo global: aquí solo se arma, en memoria, qué Perfiles de
// Participación (de uno o varios Mandantes) lo exigen y, para Persona/Maquinaria, a qué Perfiles de
// Recurso aplica. El formulario lo guarda al final con perfilRequerimientoService.sincronizar.
//
// Selección directa: cada pill de Perfil es un toggle; no hay paso "Agregar" ni lista aparte. La
// selección se conserva al cambiar de Mandante; el selector muestra cuántos vínculos (Perfil de
// Participación × Perfil de Recurso) tiene cada Mandante, ej. "Transemel (4)".
//
// "Aplica a" (solo Persona/Maquinaria) es uno por Mandante y vale para todos sus Perfiles marcados.
// Un Mandante en `mandantesBloqueados` tiene vínculos guardados que no se pueden expresar con un
// solo "Aplica a": se muestra el aviso y no se permite editarlo desde aquí.
export const VinculosPerfilesSection = ({
  perfiles = [], tipoEntidad, seleccion, onAlternar, aplicaA, onCambiarAplicaA,
  mandantesBloqueados = new Set(), conteoPorMandante = {}, mandanteInicial = "",
  obligatoria = false, mensaje = null, aviso = null,
}) => {
  // Expandida por defecto; el usuario puede plegarla igual.
  const [abierta, setAbierta] = useState(true);
  const [mandantesNombre, setMandantesNombre] = useState({});
  const [perfilesRecurso, setPerfilesRecurso] = useState([]);
  // null = el usuario todavía no eligió nada en el selector (ver `mandanteVisible`).
  const [mandanteSel, setMandanteSel] = useState(null);

  const mandanteIdsKey = [...new Set(perfiles.map((p) => p.mandanteId))].sort().join(",");
  useEffect(() => {
    if (!mandanteIdsKey) return;
    Promise.all(
      mandanteIdsKey.split(",").map((id) =>
        mandanteService.obtenerPorId(id).then((m) => [id, getMandanteDisplayName(m) || id]).catch(() => [id, id]),
      ),
    ).then((pares) => setMandantesNombre(Object.fromEntries(pares)));
  }, [mandanteIdsKey]);

  // Perfiles de Recurso visibles para el actor (cualquier estado: uno ya elegido que quedó inactivo
  // se sigue mostrando marcado).
  useEffect(() => {
    perfilRecursoService.listar({})
      .then((data) => setPerfilesRecurso(data || []))
      .catch((err) => console.error("Error al cargar perfiles de recurso:", err));
  }, []);

  const nombreMandante = (id) => mandantesNombre[id] || "…";

  const mandantesOpciones = [...new Set(perfiles.filter((p) => p.estado === "activo").map((p) => p.mandanteId))]
    .sort((a, b) => nombreMandante(a).localeCompare(nombreMandante(b), "es"))
    .map((id) => ({
      value: id,
      label: conteoPorMandante[id] ? `${nombreMandante(id)} (${conteoPorMandante[id]})` : nombreMandante(id),
    }));

  // En edición, mientras el usuario no elija otro, se muestra el Mandante del primer vínculo vigente.
  const mandanteVisible = mandanteSel ?? mandanteInicial;
  const bloqueado = mandantesBloqueados.has(mandanteVisible);

  const perfilesDelMandante = perfiles
    .filter((p) => p.mandanteId === mandanteVisible && p.estado === "activo")
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));

  const valorAplicaA = aplicaA[mandanteVisible] ?? null;
  const perfilesRecursoDelMandante = perfilesRecurso
    .filter((p) => p.mandanteId === mandanteVisible && p.tipo === tipoEntidad
      && (p.estado === "activo" || (valorAplicaA || []).includes(p.id)))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
  const hayMarcadosEnMandante = perfilesDelMandante.some((p) => seleccion.has(p.id));

  const cantidad = Object.values(conteoPorMandante).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-3">
    {aviso && (
      <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{aviso}</p>
    )}
    <div className="bg-white rounded-2xl border border-gray-100 shadow-card">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        className="w-full flex items-center gap-2 p-6 text-left"
      >
        {abierta ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        <Link2 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Vincular a Perfiles de Participación</h3>
        {!obligatoria && <span className="text-[11px] font-semibold text-slate-400">(opcional)</span>}
        {obligatoria && <span className="text-[11px] font-bold text-red-500">*</span>}
        {cantidad > 0 && (
          <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary-lighter text-primary-dark">
            {cantidad} {cantidad === 1 ? "vínculo" : "vínculos"}
          </span>
        )}
      </button>

      {abierta && (
        <div className="px-6 pb-6 space-y-4">
          {mensaje && (
            <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{mensaje}</p>
          )}
          <p className="text-[11px] text-slate-500">
            El Requerimiento es global: elige un Mandante y marca sus Perfiles; puedes combinar Perfiles de varios
            Mandantes. Los vínculos se crean al guardar. Desmarcar un Perfil solo quita su relación con el
            Requerimiento, nunca el Requerimiento.
          </p>

          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Mandante</label>
              <SelectConBusqueda
                bloque
                autoFocus
                value={mandanteVisible}
                onChange={setMandanteSel}
                textoVacio="Seleccione un Mandante..."
                placeholder="Buscar mandante..."
                options={[{ value: "", label: "Seleccione un Mandante..." }, ...mandantesOpciones]}
              />
            </div>
            {mandanteVisible && bloqueado && (
              <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                Los Perfiles de Participación de este Mandante no aplican este Requerimiento a los mismos Perfiles de
                Recurso, así que no se pueden editar aquí sin reescribirlos. Se conservan tal cual; ajústalos desde
                la configuración de requerimientos de cada Perfil de Participación.
              </p>
            )}
            {mandanteVisible && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Perfiles de Participación</label>
                {perfilesDelMandante.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">Este Mandante no tiene Perfiles de Participación activos.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {perfilesDelMandante.map((p) => {
                      const activo = seleccion.has(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={activo}
                          disabled={bloqueado}
                          onClick={() => onAlternar(p.id)}
                          className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                            activo ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          {p.nombre}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {mandanteVisible && !bloqueado && tipoEntidad !== "empresa" && hayMarcadosEnMandante && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Aplica a</label>
                <AplicaAPills
                  perfiles={perfilesRecursoDelMandante}
                  valor={valorAplicaA}
                  onChange={(valor) => onCambiarAplicaA(mandanteVisible, valor)}
                />
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Vale para todos los Perfiles de Participación marcados de este Mandante.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </div>
  );
};
