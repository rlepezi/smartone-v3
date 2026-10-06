import React, { useEffect, useState } from "react";
import { Animated, View, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { radius, spacing } from "../theme/spacing";

// Skeleton simple con fade loop, sin dependencias externas. useState (no
// useRef) para la instancia estable de Animated.Value: leer `.current` de
// un ref durante el render está prohibido por las reglas de react-hooks
// (eslint-config-expo ~57).
function SkeletonBlock({ style }) {
  const [opacity] = useState(() => new Animated.Value(0.4));

  useEffect(() => {
    const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1, duration: 600, useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.4, duration: 600, useNativeDriver: true,
          }),
        ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[styles.block, style, { opacity }]}
    />
  );
}

export function SkeletonList({ rows = 6 }) {
  return (
    <View style={{ padding: spacing.lg, gap: spacing.sm }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} style={{ height: 72, borderRadius: radius.card }} />
      ))}
    </View>
  );
}

export function SkeletonCard({ height = 120 }) {
  return (
    <SkeletonBlock
      style={{ height, borderRadius: radius.card, margin: spacing.lg }}
    />
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.border },
});
