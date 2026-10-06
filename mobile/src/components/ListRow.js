import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors, entityColors } from "../theme/colors";
import { spacing, radius, shadow, minTouchTarget } from "../theme/spacing";
import { typography } from "../theme/typography";
import { StatusPill } from "./StatusPill";

function iniciales(texto) {
  if (!texto) return "?";
  const partes = texto.trim().split(/\s+/);
  return (partes[0]?.[0] || "") + (partes[1]?.[0] || "");
}

// Fila de lista: avatar circular con iniciales (color de la ENTIDAD, nunca
// aleatorio), título, subtítulo mono, meta, StatusPill y chevron.
export function ListRow({
  entity, titulo, subtituloMono, meta, metaNode, estado, extra, onPress,
}) {
  const { color, bg } = entityColors[entity];

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.avatar, { backgroundColor: bg }]}>
        <Text style={[typography.body, { color, fontWeight: "700" }]}>
          {iniciales(titulo).toUpperCase()}
        </Text>
      </View>
      <View style={styles.info}>
        <Text style={[typography.body, { color: colors.ink }]} numberOfLines={1}>
          {titulo}
        </Text>
        {subtituloMono ? (
          <Text style={[typography.mono, { color: colors.muted }]}>{subtituloMono}</Text>
        ) : null}
        {meta ? (
          <Text style={[typography.caption, { color: colors.muted }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {metaNode}
      </View>
      <View style={styles.aside}>
        <View style={styles.asideInfo}>
          {extra ? (
            <Text style={[typography.body, { color: colors.ink, fontWeight: "700" }]}>
              {extra}
            </Text>
          ) : null}
          <StatusPill estado={estado} />
        </View>
        <ChevronRight color={colors.muted} size={18} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...shadow,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
  },
  info: { flex: 1, gap: 2 },
  aside: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  asideInfo: { alignItems: "flex-end", gap: spacing.xs },
});
