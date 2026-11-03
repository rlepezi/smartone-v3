import React from "react";
import { View, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

// Barra segmentada. segments: [{ value, color }]. Sin valores, una barra vacía.
export function SegmentBar({ segments, height = 8 }) {
  const total = segments.reduce((t, s) => t + (s.value || 0), 0);
  return (
    <View style={[styles.barra, { height, borderRadius: height / 2 }]}>
      {total > 0 ? segments.filter((s) => s.value > 0).map((s, i) => (
        <View key={i} style={{ flex: s.value, backgroundColor: s.color }} />
      )) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  barra: { flexDirection: "row", overflow: "hidden", backgroundColor: colors.border, gap: 2 },
});
