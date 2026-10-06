import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import { ArrowLeft } from "lucide-react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";
import { Logo } from "./Logo";

// Curvas decorativas: círculos translúcidos superpuestos, recortados por
// el propio header (overflow hidden) — mismo efecto que las referencias.
function DecorativeCurves() {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Circle cx="88%" cy="0%" r={140} fill="rgba(255,255,255,0.06)" />
      <Circle cx="100%" cy="30%" r={90} fill="rgba(255,255,255,0.06)" />
    </Svg>
  );
}

// variant="home": logo + nombre del Mandante + slot `right` (RoleSelector).
// variant="detail": flecha atrás + título + slot `right`, con `children`
// como contenido adicional debajo (ícono, código, pill de estado, etc).
export function GradientHeader({
  variant = "home",
  mandanteNombre,
  title,
  onBack,
  right,
  children,
}) {
  return (
    <LinearGradient
      colors={[colors.headerFrom, colors.headerTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.header}
    >
      <DecorativeCurves />

      {variant === "home" ? (
        <View style={styles.row}>
          <View>
            <Logo height={30} />
            {mandanteNombre ? (
              <Text style={[typography.caption, styles.mandante]}>
                {mandanteNombre}
              </Text>
            ) : null}
          </View>
          {right}
        </View>
      ) : (
        <View style={styles.row}>
          <View style={styles.detailTitleRow}>
            {onBack ? (
              <TouchableOpacity
                onPress={onBack}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <ArrowLeft color={colors.onDark} size={24} />
              </TouchableOpacity>
            ) : null}
            <Text style={[typography.headerTitle, styles.detailTitle]} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {right}
        </View>
      )}

      {children ? <View style={styles.extra}>{children}</View> : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  mandante: { color: colors.accent, marginTop: spacing.xs },
  detailTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  detailTitle: { color: colors.onDark, flexShrink: 1 },
  extra: { marginTop: spacing.lg, gap: spacing.sm },
});
