import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { estadoNivel, TONO_SEGMENTO } from "../theme/status";
import { spacing } from "../theme/spacing";
import { typography, MAX_FONT_SCALE } from "../theme/typography";
import { textoPorcentaje } from "../utils/complianceStatus";
import { plural } from "../utils/texto";
import { StatusBadge } from "./StatusBadge";
import { SegmentBar } from "./SegmentBar";

// Resumen de cumplimiento: % grande, badge de nivel, barra segmentada (aprobados / rechazados /
// sin revisar) y "Revisión: X de N requerimientos". `nivel`: resultado de nivelDeResumen (o de un
// agregado del índice). El % es siempre cumple / aplicables; nunca se oculta.
export function ComplianceSummary({ nivel, titulo = "Cumplimiento" }) {
  if (!nivel) return null;
  const estado = estadoNivel(nivel.clave);
  const { aprobados = 0, rechazados = 0, sinRevisar = 0, revisados = 0, aplicables = 0 } = nivel;
  return (
    <View style={styles.card}>
      <View style={styles.fila}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.caption, { color: colors.textSubtle }]}>{titulo}</Text>
          <Text style={[typography.display, { color: estado.fg }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {textoPorcentaje(nivel.pct)}
          </Text>
        </View>
        <StatusBadge estado={estado} />
      </View>
      <SegmentBar segments={[
        { value: aprobados, color: TONO_SEGMENTO.aprobados },
        { value: rechazados, color: TONO_SEGMENTO.rechazados },
        { value: sinRevisar, color: TONO_SEGMENTO.sinRevisar },
      ]} />
      <View style={styles.leyenda}>
        <Leyenda color={TONO_SEGMENTO.aprobados} texto={`${aprobados} aprobados`} />
        <Leyenda color={TONO_SEGMENTO.rechazados} texto={`${rechazados} rechazados`} />
        <Leyenda color={TONO_SEGMENTO.sinRevisar} texto={`${sinRevisar} sin revisar`} />
      </View>
      <Text style={[typography.caption, { color: colors.textMuted }]}>
        Revisión: {revisados} de {plural(aplicables, "requerimiento")}
      </Text>
    </View>
  );
}

function Leyenda({ color, texto }) {
  return (
    <View style={styles.item}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[typography.caption, { color: colors.textMuted }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  fila: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  leyenda: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  item: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
