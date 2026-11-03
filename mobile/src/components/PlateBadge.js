import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TriangleAlert } from "lucide-react-native";
import { colors } from "../theme/colors";
import { spacing, radius } from "../theme/spacing";
import { typography, MAX_FONT_SCALE } from "../theme/typography";
import { identificadorEquipo } from "../utils/identificacionEquipo";

// Placa estilo Chile (fondo blanco, borde oscuro, franja "CHILE"). Solo para patentes válidas.
export function PlateBadge({ patente }) {
  if (!patente) return null;
  return (
    <View style={styles.placa}>
      <Text style={styles.chile} maxFontSizeMultiplier={1}>CHILE</Text>
      <Text style={[typography.mono, styles.texto]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{patente}</Text>
    </View>
  );
}

// Identificador de un Equipo (utils/identificacionEquipo.js): placa, "N° serie X" o aviso ámbar
// "Patente no válida". Sin identificador no muestra nada.
export function EquipoIdentificador({ recurso }) {
  const id = identificadorEquipo(recurso);
  if (id.tipo === "patente") return <PlateBadge patente={id.valor} />;
  if (id.tipo === "serie") {
    return <Text style={[typography.mono, { color: colors.textMuted }]}>N° serie {id.valor}</Text>;
  }
  if (id.tipo === "invalida") {
    return (
      <View style={styles.aviso}>
        <TriangleAlert color={colors.warningText} size={14} />
        <Text style={[typography.label, { color: colors.warningText }]} maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}>
          Patente no válida: {id.valor}
        </Text>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  placa: {
    alignSelf: "flex-start", alignItems: "center", backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.text, borderRadius: 6, paddingHorizontal: spacing.sm, paddingBottom: 2,
  },
  chile: { fontSize: 7, letterSpacing: 1.5, color: colors.textMuted, fontFamily: typography.label.fontFamily },
  texto: { fontSize: 14, color: colors.text, letterSpacing: 1 },
  aviso: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    backgroundColor: colors.warningBg, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
});
