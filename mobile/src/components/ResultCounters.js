import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ESTADO_RESULTADO } from "../theme/status";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";

// Cumple / No cumple / Pendiente — reemplaza el "Aprobados/Rechazados" de
// la v2 (en v3 los resultados de Evaluación se llaman así).
export function ResultCounters({ cumple, noCumple, pendiente }) {
  const items = [
    { valor: cumple, ...ESTADO_RESULTADO.cumple },
    { valor: noCumple, ...ESTADO_RESULTADO.no_cumple },
    { valor: pendiente, ...ESTADO_RESULTADO.pendiente },
  ];
  return (
    <View style={styles.row}>
      {items.map((item) => (
        <View key={item.label} style={styles.col}>
          <Text style={[typography.cardTitle, { color: item.fg }]}>{item.valor}</Text>
          <Text style={[typography.caption, styles.label]}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between" },
  col: { alignItems: "center", flex: 1, gap: spacing.xs },
  label: { color: colors.muted },
});
