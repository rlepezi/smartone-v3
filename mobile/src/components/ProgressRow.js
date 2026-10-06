import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";

// Porcentaje + barra + ratio x/y. `pct` null = "nada evaluable todavía"
// (nunca se muestra como 0% — ver decisions.md / mobile/AGENTS.md).
export function ProgressRow({ pct, ratio, label, barColor = colors.primary }) {
  const sinDatos = pct === null || pct === undefined;
  return (
    <View>
      <View style={styles.header}>
        {label ? (
          <Text style={[typography.body, { color: colors.muted }]}>{label}</Text>
        ) : <View />}
        <View style={styles.headerRight}>
          {ratio ? (
            <Text style={[typography.caption, { color: colors.muted }]}>
              {ratio.num}/{ratio.den}
            </Text>
          ) : null}
          <Text style={[typography.cardTitle, { color: colors.ink }]}>
            {sinDatos ? "Sin datos" : `${Math.round(pct)}%`}
          </Text>
        </View>
      </View>
      <View style={styles.track}>
        {!sinDatos && (
          <View
            style={[
              styles.fill,
              { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: barColor },
            ]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: spacing.xs,
  },
  headerRight: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 999 },
});
