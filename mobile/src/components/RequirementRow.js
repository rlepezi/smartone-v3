import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { CircleCheck, CircleX, CalendarX, CircleDashed, CircleMinus } from "lucide-react-native";
import { colors } from "../theme/colors";
import { estadoRequerimiento } from "../theme/status";
import { spacing, radius } from "../theme/spacing";
import { typography, MAX_FONT_SCALE } from "../theme/typography";
import { formatDate } from "../utils/fechas";

const ICONOS = {
  aprobado: CircleCheck,
  rechazado: CircleX,
  vencido: CalendarX,
  sinRevisar: CircleDashed,
  noAplica: CircleMinus,
};

// Fila de requerimiento: número, nombre, vencimiento (si aplica), ícono + etiqueta de estado y
// fondo tintado según el estado.
export function RequirementRow({ numero, nombre, estado, fechaVencimiento }) {
  const e = estadoRequerimiento(estado);
  const Icono = ICONOS[estado] || CircleDashed;
  return (
    <View style={[styles.fila, { backgroundColor: e.bg }]}>
      <Text style={[typography.label, styles.numero]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{numero}</Text>
      <View style={styles.cuerpo}>
        <Text style={[typography.body, { color: colors.text }]}>{nombre}</Text>
        {fechaVencimiento ? (
          <Text style={[typography.caption, { color: estado === "vencido" ? e.fg : colors.textMuted }]}>
            {estado === "vencido" ? "Venció el" : "Vence el"} {formatDate(fechaVencimiento)}
          </Text>
        ) : null}
      </View>
      <View style={styles.estado}>
        <Icono color={e.fg} size={16} />
        <Text style={[typography.label, { color: e.fg }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{e.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.button,
  },
  numero: { width: 22, textAlign: "center", color: colors.textSubtle },
  cuerpo: { flex: 1, minWidth: 0, gap: 2 },
  estado: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: 110 },
});
