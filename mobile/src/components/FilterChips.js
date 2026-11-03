import React from "react";
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from "react-native";
import { colors } from "../theme/colors";
import { spacing, radius } from "../theme/spacing";
import { typography, MAX_FONT_SCALE } from "../theme/typography";

// Chips con scroll horizontal. options: [{ value, label, count? }]; value null = "Todos".
export function FilterChips({ options, value, onChange }) {
  return (
    <View style={styles.contenedor}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {options.map((opt) => {
          const activo = opt.value === value;
          return (
            <TouchableOpacity
              key={String(opt.value)}
              onPress={() => onChange(opt.value)}
              style={[styles.chip, activo && styles.chipActivo]}
              accessibilityState={{ selected: activo }}
            >
              <Text style={[typography.label, { color: activo ? colors.onDark : colors.textMuted }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {opt.label}
              </Text>
              {opt.count !== undefined && opt.count !== null ? (
                <View style={[styles.count, activo && styles.countActivo]}>
                  <Text style={[typography.label, { color: activo ? colors.primary : colors.textMuted }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    {opt.count}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { marginHorizontal: -spacing.lg, marginBottom: spacing.md },
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  chip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  count: { minWidth: 20, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: colors.bg, alignItems: "center" },
  countActivo: { backgroundColor: colors.surface },
});
