import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";

// Pares label/valor (fechas de contrato, administrador, etc). Un campo sin
// dato confirmado del backend simplemente no se incluye en `items` — nunca
// un placeholder tipo "- - -".
export function InfoGrid({ items }) {
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <View key={item.label} style={styles.item}>
          <Text style={[typography.caption, { color: colors.muted }]}>{item.label}</Text>
          <Text style={[typography.body, { color: colors.ink }]}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  item: { flexBasis: "45%", gap: 2 },
});
