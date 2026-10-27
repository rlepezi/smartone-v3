import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { CrearPerfilRecurso } from "./CrearPerfilRecurso";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { perfilRecursoService } from "../../services/perfilRecursoService";
import { puedeCrearPerfilRecurso } from "../../utils/permisosPerfilRecurso";

const TAMANOS = {
  sm: { pill: "px-2.5 py-1 text-[10px]", select: "px-2.5 py-1.5 text-[11px] rounded-lg", gap: "gap-1.5" },
  md: { pill: "px-3 py-1.5 text-[11px]", select: "px-3.5 py-2.5 text-sm rounded-xl", gap: "gap-2" },
};

// Selector de Perfil de Recurso de UNA persona o maquinaria al asignarla (asistente de Nueva
// Acreditación, Ingresar recurso, Cambiar Proyecto, Reemplazar Acreditación). Único componente
// para todos:
//  - Persona: pills de selección múltiple (uno o más perfiles) y, al final, la pill "+ Nuevo perfil".
//  - Maquinaria: un select (un solo perfil) y, a su lado, el botón "+ Nuevo perfil".
// "+ Nuevo perfil" abre el modal compartido con el Mandante y la Clasificación fijos; al guardar,
// el perfil nuevo queda asignado a ESTA fila (maquinaria: reemplaza; persona: se agrega) y se avisa
// con `onPerfilCreado({ id, nombre, tipo })` para que quien lo usa recargue la lista de perfiles.
// Por defecto quien lo usa le pasa solo perfiles activos. Si la lista trae alguno inactivo
// (`estado` distinto de "activo"), elegirlo pide confirmación: se activa y recién entonces se
// asigna; si se cancela, no queda elegido.
//  - `tipo`: "persona" | "recurso".  `perfiles`: [{ id, nombre, estado? }] de ese tipo.
//  - `valor`: perfilRecursoIds elegidos.  `onChange(ids)`.
//  - `error`: texto de error de la fila (borde rojo y mensaje), o null.
//  - `etiqueta`: nombre accesible del grupo o del select.
export const SelectorPerfilRecurso = ({
  tipo, perfiles = [], valor = [], onChange, mandanteId, onPerfilCreado,
  error = null, tamano = "md", etiqueta = "Perfil de Recurso", anchoCompleto = false,
}) => {
  const { profile } = useAuth();
  const puedeCrear = puedeCrearPerfilRecurso(profile?.rol);
  const t = TAMANOS[tamano] || TAMANOS.md;
  const [aviso, setAviso] = useState(null);
  // Perfil inactivo elegido, pendiente de confirmar su activación.
  const [porActivar, setPorActivar] = useState(null);
  const [activando, setActivando] = useState(false);
  const [errorActivar, setErrorActivar] = useState(null);

  const asignar = (id) => onChange(tipo === "persona" ? [...new Set([...valor, id])] : [id]);
  const estaInactivo = (id) => {
    const perfil = perfiles.find((p) => p.id === id);
    return perfil && perfil.estado && perfil.estado !== "activo" ? perfil : null;
  };
  // Elegir un perfil: si está inactivo, primero se confirma su activación.
  const elegir = (id) => {
    const inactivo = estaInactivo(id);
    if (inactivo) {
      setErrorActivar(null);
      setPorActivar(inactivo);
      return;
    }
    asignar(id);
  };
  const confirmarActivacion = async () => {
    setActivando(true);
    try {
      await perfilRecursoService.actualizar(porActivar.id, { estado: "activo" });
      onPerfilCreado?.({ id: porActivar.id, nombre: porActivar.nombre, tipo, reactivado: true });
      asignar(porActivar.id);
      setAviso(`Perfil '${porActivar.nombre}' activado y asignado`);
      setPorActivar(null);
    } catch (err) {
      setErrorActivar(err.message || "No se pudo activar el perfil.");
    } finally {
      setActivando(false);
    }
  };

  useEffect(() => {
    if (!aviso) return undefined;
    const temporizador = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(temporizador);
  }, [aviso]);

  const alCrear = (perfil) => {
    onPerfilCreado?.(perfil);
    if (perfil?.id) {
      asignar(perfil.id);
      setAviso(perfil.reactivado ? `Perfil '${perfil.nombre}' activado y asignado`
        : perfil.existente ? `Perfil '${perfil.nombre}' asignado`
          : `Perfil ${perfil.nombre} creado y asignado`);
    }
  };

  const crear = (variante) => (
    <CrearPerfilRecurso variante={variante} tipo={tipo} mandanteId={mandanteId} onCreado={alCrear} />
  );

  return (
    <div className="space-y-1">
      {tipo === "persona" ? (
        <div role="group" aria-label={etiqueta} className={`flex flex-wrap items-center ${t.gap}`}>
          {perfiles.map((p, i) => {
            const activo = valor.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={activo}
                data-asistente-foco={i === 0 ? "" : undefined}
                onClick={() => (activo ? onChange(valor.filter((x) => x !== p.id)) : elegir(p.id))}
                className={`${t.pill} rounded-full font-semibold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  activo ? "bg-primary text-white border-primary"
                    : error ? "bg-white text-slate-600 border-red-300 hover:bg-red-50"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {p.nombre}{p.estado && p.estado !== "activo" ? " (inactivo)" : ""}
              </button>
            );
          })}
          {crear("pill")}
        </div>
      ) : (
        <div className={`flex items-center flex-wrap ${t.gap}`}>
          <select
            value={valor[0] || ""}
            onChange={(e) => (e.target.value ? elegir(e.target.value) : onChange([]))}
            aria-label={etiqueta}
            aria-invalid={Boolean(error)}
            data-asistente-foco=""
            className={`${t.select} ${anchoCompleto ? "flex-1 min-w-40" : ""} bg-white border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
              error ? "border-red-400 bg-red-50/30" : "border-gray-200"
            }`}
          >
            <option value="">Perfil de Recurso...</option>
            {perfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}{p.estado && p.estado !== "activo" ? " (inactivo)" : ""}
              </option>
            ))}
          </select>
          {crear("boton")}
        </div>
      )}
      {error && (
        <p className="text-[11px] font-semibold text-red-500">
          {error}{!puedeCrear && ". Pide a un administrador que cree el perfil"}
        </p>
      )}
      {porActivar && (
        <ConfirmacionModal
          peligro
          titulo={`El perfil '${porActivar.nombre}' está inactivo`}
          mensaje={errorActivar || `El perfil '${porActivar.nombre}' ya existe y está inactivo. Se activará para volver a usarlo.`}
          textoConfirmar="Activar y usar"
          ocupado={activando}
          onCancelar={() => setPorActivar(null)}
          onConfirmar={confirmarActivacion}
        />
      )}
      {aviso && (
        <p role="status" className="inline-flex items-center gap-1 text-[11px] font-semibold text-sage-darker">
          <CheckCircle2 className="w-3.5 h-3.5" /> {aviso}
        </p>
      )}
    </div>
  );
};
