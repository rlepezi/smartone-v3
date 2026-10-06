// Plus Jakarta Sans para la UI general, IBM Plex Mono para RUT, patentes y
// códigos de proyecto. Escala fija de 5 niveles (Entrega 1.1) — no crear
// tamaños sueltos fuera de esto.
export const fontFamily = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semiBold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extraBold: "PlusJakartaSans_800ExtraBold",
  mono: "IBMPlexMono_500Medium",
};

export const typography = {
  // Números de KPI grandes (Inicio, Cumplimiento agregado).
  display: { fontFamily: fontFamily.extraBold, fontSize: 34 },
  // Título del header (GradientHeader).
  headerTitle: { fontFamily: fontFamily.extraBold, fontSize: 28 },
  // Título de card (SectionCard, EntityCard).
  cardTitle: { fontFamily: fontFamily.bold, fontSize: 18 },
  // Texto de cuerpo.
  body: { fontFamily: fontFamily.medium, fontSize: 15 },
  // Texto secundario / pills / meta.
  caption: { fontFamily: fontFamily.medium, fontSize: 13 },
  // RUT, patentes, códigos de proyecto.
  mono: { fontFamily: fontFamily.mono, fontSize: 13 },
};
