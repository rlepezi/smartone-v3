import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";

export function EmptyState({ title = "Sin resultados", message }) {
  return (
    <View style={styles.wrapper}>
      <Text style={[typography.cardTitle, { color: colors.ink }]}>{title}</Text>
      {message ? (
        <Text style={[typography.body, styles.message]}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", padding: spacing.xxl, gap: spacing.xs },
  message: { color: colors.muted, textAlign: "center" },
});
