// Al seleccionar texto arrastrando (por ejemplo, de derecha a izquierda en un campo) y soltar el
// mouse sobre el fondo oscuro de un modal, el navegador dispara un "click" en ese fondo, que es el
// ancestro común entre donde se presionó y donde se soltó. Como los modales se cierran con un clic
// en el fondo, se cerraban solos. Este filtro global descarta ese clic cuando no empezó en el
// mismo elemento: se presionó dentro de un campo editable, o se arrastró una selección de texto, y
// se soltó en un elemento que lo contiene. Los clics normales (presionar y soltar en el mismo
// lugar) no se tocan.
const esEditable = (el) => el instanceof Element
  && (el.closest("input, textarea, select, [contenteditable='true']") !== null);

export const instalarFiltroCierrePorArrastre = () => {
  let origen = null;
  window.addEventListener("mousedown", (e) => { origen = e.target; }, true);
  window.addEventListener("click", (e) => {
    const inicio = origen;
    origen = null;
    if (!inicio || inicio === e.target || !(e.target instanceof Node) || !e.target.contains(inicio)) return;
    const seleccion = window.getSelection?.();
    const arrastroTexto = seleccion && !seleccion.isCollapsed;
    if (esEditable(inicio) || arrastroTexto) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
};
