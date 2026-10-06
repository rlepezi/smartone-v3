// Pasa un nombre a Title Case SOLO para mostrarlo — nunca modifica el dato
// guardado. No agrega tildes que no estaban en el string original:
// "julio gonzalez" -> "Julio Gonzalez" (no "Julio González").
export function formatNombre(nombre) {
  if (!nombre) return "";
  return nombre
      .trim()
      .split(/\s+/)
      .map((palabra) => palabra.charAt(0).toUpperCase() +
        palabra.slice(1).toLowerCase())
      .join(" ");
}
