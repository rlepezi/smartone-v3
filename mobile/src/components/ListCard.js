import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing, radius } from "../theme/spacing";

// Card tocable de las listas (Proyectos, Empresas, Personas, Equipos y filas de detalle).
export function ListCard({ onPress, children, style, accessibilityLabel }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[styles.card, style]}
      accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {children}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
});
