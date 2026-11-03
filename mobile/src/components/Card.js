import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing, radius } from "../theme/spacing";
import { typography } from "../theme/typography";

// Card base de las pantallas: título opcional, acción a la derecha y contenido.
export function Card({ title, right, children, style }) {
  return (
    <View style={[styles.card, style]}>
      {title || right ? (
        <View style={styles.cabecera}>
          {title ? <Text style={[typography.cardTitle, { color: colors.text, flex: 1 }]}>{title}</Text> : <View style={{ flex: 1 }} />}
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  cabecera: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
