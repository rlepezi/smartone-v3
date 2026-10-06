import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors, entityColors } from "../theme/colors";
import { entityIcons } from "../theme/entityIcons";
import { spacing, radius, shadow } from "../theme/spacing";
import { typography } from "../theme/typography";

// Card cuadrada del grid 2x2 de Inicio: círculo de ícono con color de
// entidad, chevron en círculo, número display, label y borde inferior de
// 3px en el color de la entidad.
export function EntityCard({ entity, value, label, onPress, compact = false }) {
  const { color, bg } = entityColors[entity];
  const Icon = entityIcons[entity];

  return (
    <TouchableOpacity
      style={[styles.card, compact ? styles.cardCompact : styles.cardFull, { borderBottomColor: color }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.85 : 1}
      disabled={!onPress}
    >
      <View style={styles.header}>
        <View style={[styles.iconCircle, { backgroundColor: bg }]}>
          <Icon color={color} size={20} />
        </View>
        {onPress && (
          <View style={styles.chevronCircle}>
            <ChevronRight color={colors.muted} size={16} />
          </View>
        )}
      </View>
      <Text style={compact ? styles.valueCompact : typography.display}>{value}</Text>
      <Text style={[typography.caption, styles.label]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderBottomWidth: 3,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow,
  },
  cardFull: { flexBasis: "48%" },
  cardCompact: { flex: 1, padding: spacing.md },
  valueCompact: { ...typography.cardTitle, color: colors.ink },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  chevronCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.bg,
    alignItems: "center", justifyContent: "center",
  },
  label: { color: colors.muted },
});
