import React from "react";
import { Text, TouchableOpacity, Modal, ScrollView, StyleSheet, Pressable } from "react-native";
import { Check } from "lucide-react-native";
import { colors } from "../theme/colors";
import { spacing, radius, minTouchTarget } from "../theme/spacing";
import { typography } from "../theme/typography";

// Hoja inferior para elegir una opción. options: [{ value, label }].
export function OptionSheet({ visible, title, options, value, onChange, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.fondo} onPress={onClose}>
        <Pressable style={styles.hoja}>
          <Text style={[typography.cardTitle, { color: colors.text }]}>{title}</Text>
          <ScrollView style={{ maxHeight: 420 }}>
            {options.map((o) => (
              <TouchableOpacity key={String(o.value)} style={styles.opcion} onPress={() => { onChange(o.value); onClose(); }}>
                <Text style={[typography.body, { color: colors.text, flex: 1 }]} numberOfLines={2}>{o.label}</Text>
                {o.value === value ? <Check color={colors.primary} size={18} /> : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  hoja: {
    backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.sm,
    borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card,
  },
  opcion: {
    minHeight: minTouchTarget, flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
});
