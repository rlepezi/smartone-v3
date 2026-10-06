import React from "react";
import { View, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

// Barra apilada proporcional: un segmento por color de `theme/status.js`.
// segments: [{ value: number, color: string }]
export function StatusBarStacked({ segments }) {
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  return (
    <View style={styles.track}>
      {segments.map((s, i) => {
        const pct = total > 0 ? (s.value / total) * 100 : 0;
        if (pct === 0) return null;
        return (
          <View
            key={i}
            style={{ flex: pct, backgroundColor: s.color }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: colors.border,
  },
});
