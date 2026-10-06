import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";

// 4 columnas separadas por divisores. Número en `fg`, label y punto en
// `bar`. Cada columna es tocable (abre la lista filtrada) si trae onPress.
// items: [{ value, label, fg, bar, onPress? }]
export function StatusCounters({ items }) {
  return (
    <View style={styles.row}>
      {items.map((item, i) => {
        const Wrapper = item.onPress ? TouchableOpacity : View;
        return (
          <React.Fragment key={item.label}>
            {i > 0 && <View style={styles.divider} />}
            <Wrapper style={styles.col} onPress={item.onPress} activeOpacity={0.7}>
              <Text style={[typography.display, { color: item.fg, fontSize: 24 }]}>
                {item.value}
              </Text>
              <Text style={[typography.caption, styles.label]}>{item.label}</Text>
              {item.bar ? (
                <View style={[styles.dot, { backgroundColor: item.bar }]} />
              ) : null}
            </Wrapper>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "stretch" },
  col: { flex: 1, alignItems: "center", gap: spacing.xs },
  divider: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.xs },
  label: { color: colors.muted, textAlign: "center" },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
