// Paleta del rediseño de la app móvil. Todo color de pantallas y componentes
// viene de acá (o de theme/status.js para los estados): nunca colores sueltos.
export const colors = {
  primaryDark: "#0B2A6B", // header
  primary: "#1D4ED8", // tab activo, chip activo, links
  bg: "#F1F4F9",
  surface: "#FFFFFF",
  border: "#E2E8F0",
  text: "#0F172A",
  textMuted: "#475569",
  textSubtle: "#64748B",
  onDark: "#FFFFFF",
  onDarkMuted: "rgba(255,255,255,0.75)",
  onDarkSurface: "rgba(255,255,255,0.14)",
  // Fondo de las hojas inferiores (selector de Mandante, filtros).
  overlay: "rgba(15,23,42,0.45)",
  // Texto de error sobre el fondo oscuro del Login.
  errorOnDark: "#FDE4E5",
  // Aviso (patente no válida): mismo ámbar que "Aceptable".
  warningBg: "#FEF3C7",
  warningText: "#92400E",

  // Alias de la paleta anterior (Login): apuntan a los tokens nuevos.
  headerFrom: "#0B2A6B",
  headerTo: "#1D4ED8",
  accent: "#93C5FD",
  ink: "#0F172A",
  muted: "#64748B",
};

// Acento por entidad: círculo del ícono en accesos y avatares.
export const entityColors = {
  proyectos: { color: "#1D4ED8", bg: "#DBEAFE" },
  empresas: { color: "#6D28D9", bg: "#EDE9FE" },
  personas: { color: "#047857", bg: "#D1FAE5" },
  equipos: { color: "#B91C1C", bg: "#FEE2E2" },
};
