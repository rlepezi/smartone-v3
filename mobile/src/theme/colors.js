// Paleta del rediseño visual (Entrega 1.1). Tomada de las referencias en
// mobile/docs/design/target/ — no modificar valores sueltos en pantallas o
// componentes, todo color viene de acá.
export const colors = {
  // Header: degradado navy -> azul, con curvas decorativas en
  // rgba(255,255,255,0.06) dibujadas con SVG (ver GradientHeader).
  headerFrom: "#0A2350",
  headerTo: "#1456C8",

  // Primario y acento.
  primary: "#1E6FE8", // tab activo, chip activo, links
  accent: "#22C3E6", // "One" del logo, RUT y códigos sobre fondo oscuro

  // Base.
  bg: "#F4F7FB",
  surface: "#FFFFFF",
  border: "#E6ECF5",
  ink: "#0F1E3D",
  muted: "#5B6B82",
  onDark: "#FFFFFF",
};

// Acento por entidad: círculo del ícono y borde inferior de la card.
export const entityColors = {
  proyectos: { color: "#3B82F6", bg: "#E3EEFE" },
  empresas: { color: "#7C5CF0", bg: "#EEE9FE" },
  personas: { color: "#1FA97A", bg: "#DDF5EC" },
  maquinas: { color: "#EF5B5B", bg: "#FDE6E6" },
};
