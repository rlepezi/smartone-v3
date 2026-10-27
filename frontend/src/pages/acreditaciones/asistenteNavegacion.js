// Navegación "ir al problema" del asistente de Nueva Acreditación. Cada elemento al que se puede
// llevar al usuario tiene un identificador estable en `data-asistente-ref` (y la clase
// CLASE_RESALTADO para el resaltado temporal). El asistente usa irAProblema(paso, ref): cambia de
// paso y, cuando el elemento ya está en pantalla, llama a enfocarElemento(ref).

// Refs de los pasos y de cada persona o maquinaria del paso "Personas y Maquinarias".
export const REF_PASO = {
  1: "paso-mandante",
  2: "paso-empresa",
  3: "paso-proyecto",
  4: "paso-perfil",
};
export const REF_FECHA_INICIO = "fecha-inicio";
export const refRecurso = (tipo, id) => `recurso-${tipo}-${id}`;

// Borde y fondo suave mientras el elemento lleva `data-asistente-resaltado`.
export const CLASE_RESALTADO = "transition-colors data-[asistente-resaltado]:ring-2 data-[asistente-resaltado]:ring-amber-400 data-[asistente-resaltado]:bg-amber-50";

const DURACION_RESALTADO_MS = 3500;
const ESPERA_MAXIMA_MS = 4000;
const INTERVALO_MS = 100;

const buscar = (ref) => document.querySelector(`[data-asistente-ref="${CSS.escape(ref)}"]`);

const enfocar = (elemento) => {
  elemento.scrollIntoView({ behavior: "smooth", block: "center" });
  elemento.setAttribute("data-asistente-resaltado", "");
  setTimeout(() => elemento.removeAttribute("data-asistente-resaltado"), DURACION_RESALTADO_MS);

  const foco = elemento.matches("input, select, button, textarea")
    ? elemento
    : elemento.querySelector("[data-asistente-foco]") ||
      elemento.querySelector("select, input:not([type='checkbox']), button, textarea");
  if (!foco) return;
  foco.focus({ preventScroll: true });
  // Un selector de perfil se abre directamente (si el navegador lo permite).
  if (foco.tagName === "SELECT" && typeof foco.showPicker === "function") {
    try {
      foco.showPicker();
    } catch {
      // Sin activación del usuario o no soportado: queda con el foco puesto.
    }
  }
};

// Hace scroll al elemento, lo resalta unos segundos y le da foco. El elemento puede tardar en
// aparecer (el paso recién se monta y carga sus listas): se espera hasta ESPERA_MAXIMA_MS.
// Devuelve una función que cancela la espera.
export const enfocarElemento = (ref) => {
  let transcurrido = 0;
  let temporizador = null;
  const intentar = () => {
    const elemento = buscar(ref);
    if (elemento) {
      enfocar(elemento);
      return;
    }
    transcurrido += INTERVALO_MS;
    if (transcurrido < ESPERA_MAXIMA_MS) temporizador = setTimeout(intentar, INTERVALO_MS);
  };
  temporizador = setTimeout(intentar, 0);
  return () => clearTimeout(temporizador);
};
