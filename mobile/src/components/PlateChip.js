import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { fontFamily } from "../theme/typography";

// Placa chilena: borde oscuro, mono, "CHILE" abajo — heredado de la v2.
export function PlateChip({ patente, size = "base" }) {
  if (!patente) return null;
  const grande = size === "lg";
  return (
    <View style={[styles.chip, grande && styles.chipLg]}>
      <Text style={[styles.text, grande && styles.textLg]}>{patente}</Text>
      <Text style={[styles.chile, grande && styles.chileLg]}>CHILE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: "flex-start",
    alignItems: "center",
  },
  chipLg: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderWidth: 3 },
  text: {
    fontFamily: fontFamily.mono,
    color: colors.ink,
    letterSpacing: 1,
    fontSize: 16,
  },
  textLg: { fontSize: 22 },
  chile: {
    fontFamily: fontFamily.medium,
    color: colors.muted,
    fontSize: 8,
    letterSpacing: 2,
  },
  chileLg: { fontSize: 10 },
});
