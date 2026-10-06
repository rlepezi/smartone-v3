import React from "react";
import { Text, TouchableOpacity, StyleSheet } from "react-native";
import { User, ChevronDown } from "lucide-react-native";
import { colors } from "../theme/colors";
import { spacing, radius, minTouchTarget } from "../theme/spacing";
import { typography } from "../theme/typography";
import { can } from "../permissions/can";

// Pill translúcida: ícono de usuario + rol + chevron. Solo es tocable si
// el rol es cross-tenant (permissions/can.js: "seleccionar_mandante") —
// para mandante_admin/mandante_lector el Mandante es fijo por claim, el
// chevron se muestra apagado y sin acción.
export function RoleSelector({ rol, onPress }) {
  const tocable = can(rol, "seleccionar_mandante") && !!onPress;

  return (
    <TouchableOpacity
      style={styles.pill}
      onPress={tocable ? onPress : undefined}
      disabled={!tocable}
      activeOpacity={tocable ? 0.7 : 1}
    >
      <User color={colors.onDark} size={16} />
      <Text style={[typography.caption, styles.label]}>{rol}</Text>
      {tocable && <ChevronDown color={colors.onDark} size={16} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: minTouchTarget - 8,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
  },
  label: { color: colors.onDark },
});
