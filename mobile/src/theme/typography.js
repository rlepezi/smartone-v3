// Plus Jakarta Sans para la UI general, IBM Plex Mono para RUT, patentes,
// N° de serie y códigos de proyecto. Escala fija — no crear tamaños sueltos.
export const fontFamily = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semiBold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extraBold: "PlusJakartaSans_800ExtraBold",
  mono: "IBMPlexMono_500Medium",
};

// Tope de escalado de la fuente del sistema para números, badges, chips y la
// barra inferior: con letra grande no se cortan ("Acreditad/as").
export const MAX_FONT_SCALE = 1.3;

export const typography = {
  // Números grandes (% de cumplimiento, contadores de Inicio).
  display: { fontFamily: fontFamily.extraBold, fontSize: 32 },
  // Título del header.
  headerTitle: { fontFamily: fontFamily.extraBold, fontSize: 20 },
  // Título de card.
  cardTitle: { fontFamily: fontFamily.bold, fontSize: 16 },
  // Texto de cuerpo.
  body: { fontFamily: fontFamily.medium, fontSize: 14 },
  // Texto de cuerpo destacado (nombres en filas).
  bodyBold: { fontFamily: fontFamily.bold, fontSize: 14 },
  // Texto secundario / meta.
  caption: { fontFamily: fontFamily.medium, fontSize: 12 },
  // Badges y chips.
  label: { fontFamily: fontFamily.bold, fontSize: 11 },
  // RUT, patentes, N° de serie, códigos de proyecto.
  mono: { fontFamily: fontFamily.mono, fontSize: 12 },
};
