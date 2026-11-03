import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing, radius, minTouchTarget } from "../theme/spacing";
import { typography } from "../theme/typography";

// "Ver más" de las listas paginadas en memoria (hooks/useListPaging.js).
export function VerMas({ visible, onPress }) {
  if (!visible) return null;
  return (
    <TouchableOpacity style={styles.boton} onPress={onPress}>
      <Text style={[typography.bodyBold, { color: colors.primary }]}>Ver más</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  boton: {
    minHeight: minTouchTarget, alignItems: "center", justifyContent: "center",
    borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    marginTop: spacing.xs,
  },
});
