import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";

// Aviso de "sin datos" DENTRO de una sección: la pantalla sigue mostrando la información
// disponible de la entidad (nunca una pantalla vacía).
export function EmptyState({ title = "Sin resultados", message }) {
  return (
    <View style={styles.wrapper}>
      <Text style={[typography.bodyBold, { color: colors.text, textAlign: "center" }]}>{title}</Text>
      {message ? <Text style={[typography.caption, styles.message]}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, gap: spacing.xs },
  message: { color: colors.textSubtle, textAlign: "center" },
});
