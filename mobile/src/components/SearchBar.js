import React from "react";
import { View, TextInput, StyleSheet } from "react-native";
import { Search } from "lucide-react-native";
import { colors } from "../theme/colors";
import { spacing, radius, minTouchTarget, shadow } from "../theme/spacing";
import { typography } from "../theme/typography";

export function SearchBar({ value, onChangeText, placeholder = "Buscar..." }) {
  return (
    <View style={styles.wrapper}>
      <Search color={colors.muted} size={18} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[typography.body, styles.input]}
        returnKeyType="search"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    ...shadow,
  },
  input: {
    flex: 1,
    color: colors.ink,
  },
});
