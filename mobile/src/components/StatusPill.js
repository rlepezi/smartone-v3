import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { spacing, radius } from "../theme/spacing";
import { typography } from "../theme/typography";

// Punto + texto — nunca se comunica un estado solo con color. Recibe
// { label, fg, bar, bg } ya resueltos desde theme/status.js.
export function StatusPill({ estado }) {
  if (!estado) return null;
  return (
    <View style={[styles.pill, { backgroundColor: estado.bg }]}>
      <View style={[styles.dot, { backgroundColor: estado.bar || estado.fg }]} />
      <Text style={[typography.caption, styles.text, { color: estado.fg }]}>
        {estado.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 12 },
});
