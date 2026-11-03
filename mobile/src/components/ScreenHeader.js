import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { colors } from "../theme/colors";
import { spacing, minTouchTarget } from "../theme/spacing";
import { typography, MAX_FONT_SCALE } from "../theme/typography";

// Header compacto (fondo primaryDark).
//  - variant "lista": título + subtítulo (Mandante) + contador a la derecha.
//  - variant "detalle": volver + etiqueta (tipo de entidad) + título + metadatos; `children` va
//    debajo (badges, identificadores).
// `left` reemplaza el bloque de título (Inicio: logo); `right` va a la derecha.
export function ScreenHeader({
  variant = "lista", title, subtitle, count, label, meta, onBack, left, right, children,
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        {variant === "detalle" && onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.back} accessibilityLabel="Volver"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <ArrowLeft color={colors.onDark} size={22} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.titulos}>
          {left || (
            <>
              {label ? <Text style={[typography.label, styles.label]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{label.toUpperCase()}</Text> : null}
              {title ? <Text style={[typography.headerTitle, styles.title]} numberOfLines={2}>{title}</Text> : null}
              {subtitle ? <Text style={[typography.caption, styles.muted]} numberOfLines={1}>{subtitle}</Text> : null}
              {meta ? <Text style={[typography.mono, styles.muted]} numberOfLines={2}>{meta}</Text> : null}
            </>
          )}
        </View>
        {count !== undefined && count !== null ? (
          <View style={styles.count}>
            <Text style={[typography.cardTitle, { color: colors.onDark }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{count}</Text>
          </View>
        ) : null}
        {right}
      </View>
      {children ? <View style={styles.children}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  back: { width: minTouchTarget, height: minTouchTarget, marginLeft: -spacing.md, alignItems: "center", justifyContent: "center" },
  titulos: { flex: 1, minWidth: 0, gap: 2 },
  label: { color: colors.onDarkMuted, letterSpacing: 0.6 },
  title: { color: colors.onDark },
  muted: { color: colors.onDarkMuted },
  count: {
    minWidth: minTouchTarget, height: 36, paddingHorizontal: spacing.md, borderRadius: 18,
    backgroundColor: colors.onDarkSurface, alignItems: "center", justifyContent: "center",
  },
  children: { marginTop: spacing.md, gap: spacing.sm },
});
