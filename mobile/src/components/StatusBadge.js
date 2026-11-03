import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { spacing, radius } from "../theme/spacing";
import { typography, MAX_FONT_SCALE } from "../theme/typography";

// Badge de estado: SIEMPRE con texto además del color. `estado`: { label, bg, fg, dot } de
// theme/status.js.
export function StatusBadge({ estado, style }) {
  if (!estado) return null;
  return (
    <View style={[styles.badge, { backgroundColor: estado.bg }, style]}>
      <View style={[styles.dot, { backgroundColor: estado.dot }]} />
      <Text style={[typography.label, { color: estado.fg }]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {estado.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
