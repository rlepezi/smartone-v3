import React from "react";
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography, MAX_FONT_SCALE } from "../theme/typography";

// Tabs horizontales por proyecto/participación (código del proyecto). items: [{ key, label }].
// Con una sola participación igual se muestra (indica a qué proyecto corresponde lo de abajo).
export function TabsParticipacion({ items, value, onChange }) {
  if (!items?.length) return null;
  return (
    <View style={styles.contenedor}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((it) => {
          const activo = it.key === value;
          return (
            <TouchableOpacity key={it.key} onPress={() => onChange(it.key)} style={[styles.tab, activo && styles.tabActivo]}
              accessibilityState={{ selected: activo }}>
              <Text style={[typography.bodyBold, { color: activo ? colors.primary : colors.textSubtle }]}
                numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {it.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { marginHorizontal: -spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: spacing.md },
  row: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  tab: { minHeight: 44, justifyContent: "center", borderBottomWidth: 3, borderBottomColor: "transparent", maxWidth: 220 },
  tabActivo: { borderBottomColor: colors.primary },
});
