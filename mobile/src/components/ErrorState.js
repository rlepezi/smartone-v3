import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing, radius, minTouchTarget } from "../theme/spacing";
import { typography } from "../theme/typography";

export function ErrorState({ message, onRetry }) {
  return (
    <View style={styles.wrapper}>
      <Text style={[typography.cardTitle, { color: colors.ink }]}>
        No se pudo cargar la información
      </Text>
      <Text style={[typography.body, styles.message]}>
        {message || "Ocurrió un error inesperado."}
      </Text>
      {onRetry && (
        <TouchableOpacity style={styles.button} onPress={onRetry}>
          <Text style={[typography.body, { color: colors.onDark }]}>
            Reintentar
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", padding: spacing.xxl, gap: spacing.md },
  message: { color: colors.muted, textAlign: "center" },
  button: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
});
