import { useState } from "react";
import { PlayCircle, Lock, RotateCcw, Undo2 } from "lucide-react";
import { expedienteService, MOTIVOS_CIERRE } from "../../services/expedienteService";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { ActionButton } from "../shared/ActionButton";

const CLASE_CAMPO = "w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Acciones de estado de un Expediente (detalle). Devuelve:
//  - `botonPrincipal`: "Iniciar ejecución" (aprobado) o "Cerrar expediente" (en ejecución), o null.
//  - `accionesMenu`: ítems para el menú ⋮ ("Cerrar expediente" en la fase de evaluación;
//    "Volver a Aprobado" y "Reabrir" solo para superadmin).
//  - `modales`: los diálogos de confirmación, a dibujar en la página.
// Permisos: superadmin y mandante_admin gestionan el estado (el backend acota al Mandante);
// mandante_lector y evaluador no ven acciones. `onCambiado` recarga el detalle.
// `alcanceCierre`: { empresa, proyecto, personas, maquinarias } para mostrar qué se finaliza.
export const useAccionesEstadoExpediente = ({ expediente, rol, alcanceCierre, onCambiado }) => {
  const [dialogo, setDialogo] = useState(null); // "iniciar" | "cerrar" | "volver" | "reabrir"
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const gestiona = ["superadmin", "mandante_admin"].includes(rol);
  const esSuperadmin = rol === "superadmin";
  const estado = expediente?.estado;

  const abrir = (tipo) => {
    setDialogo(tipo);
    setMotivo("");
    setDetalle("");
    setError(null);
  };
  const cerrarDialogo = () => { if (!ocupado) setDialogo(null); };

  const ejecutar = async (accion) => {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      setDialogo(null);
      await onCambiado?.();
    } catch (err) {
      setError(err.message || "No se pudo completar la acción.");
    } finally {
      setOcupado(false);
    }
  };

  const confirmarCierre = () => {
    if (!motivo) return setError("Selecciona el motivo del cierre.");
    if (motivo === "otro" && !detalle.trim()) return setError("Indica el detalle del cierre.");
    return ejecutar(() => expedienteService.cerrar(expediente.id, { motivo, detalle: detalle.trim() || null }));
  };
  const confirmarCorreccion = (llamada) => {
    if (!detalle.trim()) return setError("Indica el motivo de la corrección.");
    return ejecutar(() => llamada(expediente.id, { detalle: detalle.trim() }));
  };

  let botonPrincipal = null;
  if (gestiona && estado === "aprobado") {
    botonPrincipal = <ActionButton variant="primary" icon={PlayCircle} onClick={() => abrir("iniciar")}>Iniciar ejecución</ActionButton>;
  } else if (gestiona && estado === "en_ejecucion") {
    botonPrincipal = <ActionButton variant="primary" icon={Lock} onClick={() => abrir("cerrar")}>Cerrar expediente</ActionButton>;
  }

  const accionesMenu = [
    ...(gestiona && ["creado", "en_revision", "con_observaciones"].includes(estado)
      ? [{ label: "Cerrar expediente", icon: Lock, onClick: () => abrir("cerrar") }] : []),
    ...(esSuperadmin && estado === "en_ejecucion"
      ? [{ label: "Volver a Aprobado", icon: Undo2, onClick: () => abrir("volver") }] : []),
    ...(esSuperadmin && estado === "cerrado"
      ? [{ label: "Reabrir expediente", icon: RotateCcw, onClick: () => abrir("reabrir") }] : []),
  ];

  const campoDetalle = (etiqueta, obligatorio) => (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1">{etiqueta}{obligatorio ? " *" : ""}</label>
      <textarea
        value={detalle}
        onChange={(e) => { setDetalle(e.target.value); setError(null); }}
        rows={2}
        maxLength={500}
        className={`${CLASE_CAMPO} resize-none border-slate-200`}
      />
    </div>
  );
  const textoError = error && <p className="text-xs font-semibold text-red-500">{error}</p>;

  const a = alcanceCierre || {};
  const itemsCierre = [
    { key: "expediente", principal: "El expediente queda cerrado y en solo lectura", secundario: "No se podrá evaluar, subir documentos ni asignar recursos." },
    { key: "participacion", principal: "Se finaliza la participación", secundario: [a.empresa, a.proyecto].filter(Boolean).join(" · ") || null },
    ...(a.personas ? [{ key: "personas", principal: `Se finalizan ${plural(a.personas, "persona asignada", "personas asignadas")}`, secundario: "Quedan disponibles para otro proyecto." }] : []),
    ...(a.maquinarias ? [{ key: "maquinarias", principal: `Se finalizan ${plural(a.maquinarias, "maquinaria asignada", "maquinarias asignadas")}`, secundario: null }] : []),
  ];

  const modales = (
    <>
      {dialogo === "iniciar" && (
        <ConfirmacionModal
          titulo="Iniciar ejecución"
          mensaje="El expediente pasa a En Ejecución: la empresa acreditada comienza a operar en el proyecto. Desde ahora el estado ya no se recalcula con las evaluaciones; si aparecen requisitos vencidos, pendientes o que no cumplen, se mostrará una alerta."
          textoConfirmar="Iniciar ejecución"
          ocupado={ocupado}
          onCancelar={cerrarDialogo}
          onConfirmar={() => ejecutar(() => expedienteService.iniciarEjecucion(expediente.id))}
        >
          {textoError}
        </ConfirmacionModal>
      )}
      {dialogo === "cerrar" && (
        <ConfirmacionModal
          peligro
          titulo="Cerrar expediente"
          mensaje="Esta acción finaliza lo siguiente (no se borra información):"
          items={itemsCierre}
          textoConfirmar="Cerrar expediente"
          ocupado={ocupado}
          onCancelar={cerrarDialogo}
          onConfirmar={confirmarCierre}
        >
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Motivo del cierre *</label>
              <select
                value={motivo}
                onChange={(e) => { setMotivo(e.target.value); setError(null); }}
                className={`${CLASE_CAMPO} border-slate-200 bg-white`}
              >
                <option value="">Selecciona un motivo...</option>
                {MOTIVOS_CIERRE.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            {motivo && campoDetalle("Detalle", motivo === "otro")}
            {textoError}
          </div>
        </ConfirmacionModal>
      )}
      {dialogo === "volver" && (
        <ConfirmacionModal
          peligro
          titulo="Volver a Aprobado"
          mensaje="Corrección de un error: el expediente sale de En Ejecución, se borra la fecha de inicio de ejecución y el estado vuelve a calcularse con las evaluaciones."
          textoConfirmar="Volver a Aprobado"
          ocupado={ocupado}
          onCancelar={cerrarDialogo}
          onConfirmar={() => confirmarCorreccion(expedienteService.volverAAprobado)}
        >
          <div className="space-y-2">
            {campoDetalle("Motivo de la corrección", true)}
            {textoError}
          </div>
        </ConfirmacionModal>
      )}
      {dialogo === "reabrir" && (
        <ConfirmacionModal
          peligro
          titulo="Reabrir expediente"
          mensaje="El expediente vuelve al estado que tenía antes del cierre. No se reactivan la participación ni las personas y maquinarias finalizadas: eso se gestiona aparte."
          textoConfirmar="Reabrir"
          ocupado={ocupado}
          onCancelar={cerrarDialogo}
          onConfirmar={() => confirmarCorreccion(expedienteService.reabrir)}
        >
          <div className="space-y-2">
            {campoDetalle("Motivo de la reapertura", true)}
            {textoError}
          </div>
        </ConfirmacionModal>
      )}
    </>
  );

  return { botonPrincipal, accionesMenu, modales };
};
