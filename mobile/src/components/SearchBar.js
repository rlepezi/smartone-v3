import React from "react";
import { View, TextInput, StyleSheet } from "react-native";
import { Search } from "lucide-react-native";
import { colors } from "../theme/colors";
import { spacing, radius, minTouchTarget } from "../theme/spacing";
import { typography } from "../theme/typography";

// Buscador. `right`: botón opcional al lado (p. ej. filtro u orden).
export function SearchBar({ value, onChangeText, placeholder = "Buscar...", onSubmit, right }) {
  return (
    <View style={styles.fila}>
      <View style={styles.wrapper}>
        <Search color={colors.textSubtle} size={18} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          placeholderTextColor={colors.textSubtle}
          style={[typography.body, styles.input]}
          returnKeyType="search"
          autoCorrect={false}
        />
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  wrapper: {
    flex: 1,
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, color: colors.text, paddingVertical: spacing.sm },
});
