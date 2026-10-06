import React from "react";
import { Pencil } from "lucide-react";
import { ActionButton } from "./ActionButton";

// Botones del encabezado de un Detalle con edición in-place: "Editar" en lectura;
// "Cancelar" + "Guardar Cambios" mientras se edita ("Guardar Cambios" envía el
// formulario cuyo id es `formId`).
export const BotonesEdicion = ({ modoEdicion, guardando, formId, onEditar, onCancelar }) => (
  modoEdicion ? (
    <>
      <ActionButton disabled={guardando} onClick={onCancelar}>
        Cancelar
      </ActionButton>
      <button
        type="submit"
        form={formId}
        disabled={guardando}
        className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all disabled:opacity-50"
      >
        {guardando ? "Guardando..." : "Guardar Cambios"}
      </button>
    </>
  ) : (
    <ActionButton icon={Pencil} onClick={onEditar}>
      Editar
    </ActionButton>
  )
);
