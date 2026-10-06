import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { cn } from "../../utils/cn";

const MENU_WIDTH = 176; // w-44
const ALTURA_ITEM_ESTIMADA = 38;
const PADDING_VERTICAL_MENU = 16;
const SEPARACION_BOTON = 4;

// Menú desplegable compacto para la columna "Acciones" de una fila de
// tabla: un ícono "⋮" que despliega la lista de acciones al hacer clic,
// en vez de un botón de texto completo por acción. `actions` ya viene
// filtrado por quien lo usa (los `puedeEscribir`/condiciones de estado se
// resuelven antes de construir el array, acá solo se renderiza lo que
// llega).
//
// El menú se renderiza en un portal hacia document.body, posicionado con
// coordenadas fijas calculadas desde el botón trigger — así queda libre
// del overflow del contenedor scrolleable de la tabla (que si no, lo
// recorta visualmente).
export const RowActionsMenu = ({ actions = [] }) => {
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      const dentroDelBoton = buttonRef.current?.contains(e.target);
      const dentroDelMenu = menuRef.current?.contains(e.target);
      if (!dentroDelBoton && !dentroDelMenu) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = () => {
    if (!abierto && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const alturaMenuEstimada = actions.length * ALTURA_ITEM_ESTIMADA + PADDING_VERTICAL_MENU;
      const cabeAbajo = rect.bottom + alturaMenuEstimada <= window.innerHeight;

      setPosicion({
        top: cabeAbajo
          ? rect.bottom + SEPARACION_BOTON
          : rect.top - alturaMenuEstimada - SEPARACION_BOTON,
        left: rect.right - MENU_WIDTH,
      });
    }
    setAbierto((v) => !v);
  };

  if (actions.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {abierto && posicion && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: posicion.top, left: posicion.left, width: MENU_WIDTH }}
          className="bg-white rounded-xl border border-slate-100 shadow-dropdown overflow-hidden z-50"
        >
          {actions.map((action, i) => {
            const Icon = action.icon;
            return (
              <button
                key={i}
                type="button"
                disabled={action.disabled}
                onClick={() => {
                  setAbierto(false);
                  action.onClick?.();
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-left transition-colors",
                  action.disabled
                    ? "text-slate-300 cursor-not-allowed"
                    : "text-slate-600 hover:bg-slate-50",
                )}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {action.label}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
};
