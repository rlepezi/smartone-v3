import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

// Estado de la edición in-place de una pantalla de Detalle (patrón definitivo, ver
// decisions.md): "Editar" activa `modoEdicion`, el encabezado pasa a
// "Cancelar" / "Guardar Cambios" y cada pestaña habilita sus controles de gestión.
//
//   puedeEditar        quién puede activar la edición (roles de escritura).
//   onGuardado         se llama (y se espera) tras guardar, p. ej. para recargar.
//
// Llegar con ?editar=1 (p. ej. desde el antiguo /x/:id/editar) la activa de entrada.
// Con cambios sin guardar avisa al cerrar la pestaña y al hacer clic en cualquier
// enlace interno que cambie de pantalla (la app usa BrowserRouter, sin useBlocker).
export const useEdicionInPlace = ({ puedeEditar, onGuardado }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [modoEdicion, setModoEdicion] = useState(searchParams.get("editar") === "1" && puedeEditar);
  const [hayCambiosSinGuardar, setHayCambiosSinGuardar] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const salirDeEdicion = () => {
    setModoEdicion(false);
    setHayCambiosSinGuardar(false);
    if (searchParams.get("editar")) setSearchParams({}, { replace: true });
  };

  const cancelar = () => {
    if (hayCambiosSinGuardar && !window.confirm("Tienes cambios sin guardar. ¿Descartarlos?")) return;
    salirDeEdicion();
  };

  const alGuardar = async () => {
    salirDeEdicion();
    await onGuardado?.();
  };

  // true si se puede salir de la pantalla (sin cambios pendientes o el usuario confirma).
  const confirmarSalida = () =>
    !(modoEdicion && hayCambiosSinGuardar) || window.confirm("Tienes cambios sin guardar. ¿Salir sin guardarlos?");

  useEffect(() => {
    if (!(modoEdicion && hayCambiosSinGuardar)) return undefined;
    const antesDeCerrar = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const alHacerClic = (e) => {
      const enlace = e.target.closest?.("a[href]");
      if (!enlace) return;
      const destino = new URL(enlace.href, window.location.href);
      if (destino.origin !== window.location.origin || destino.pathname === window.location.pathname) return;
      if (!window.confirm("Tienes cambios sin guardar. ¿Salir sin guardarlos?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", antesDeCerrar);
    document.addEventListener("click", alHacerClic, true);
    return () => {
      window.removeEventListener("beforeunload", antesDeCerrar);
      document.removeEventListener("click", alHacerClic, true);
    };
  }, [modoEdicion, hayCambiosSinGuardar]);

  return {
    modoEdicion,
    iniciarEdicion: () => setModoEdicion(true),
    cancelar,
    alGuardar,
    confirmarSalida,
    guardando,
    setGuardando,
    setHayCambiosSinGuardar,
  };
};
