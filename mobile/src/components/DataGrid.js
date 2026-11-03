import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";

// Pares etiqueta/valor en dos columnas. items: [{ label, value }]; un valor vacío se muestra "—".
export function DataGrid({ items }) {
  return (
    <View style={styles.grid}>
      {items.map((it) => (
        <View key={it.label} style={styles.celda}>
          <Text style={[typography.caption, { color: colors.textSubtle }]}>{it.label}</Text>
          <Text style={[typography.bodyBold, { color: colors.text }]}>{it.value || "—"}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.md },
  celda: { width: "50%", paddingRight: spacing.sm, gap: 2 },
});
