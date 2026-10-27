import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { FileText } from "lucide-react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";
import { StatusPill } from "./StatusPill";
import { estadoResultado, estadoPorDiasRestantes } from "../theme/status";
import { formatFecha, diasRestantes } from "../utils/fechas";

// Fila de un Requerimiento: número de orden (como en la v2), ícono neutro
// de documento (el backend no entrega una categoría de ícono por
// Requerimiento — no se inventa un mapeo nombre->ícono), nombre, StatusPill
// y vencimiento (en ámbar cuando faltan <=30 días).
export function ReqRow({ numero, nombre, evaluacion }) {
  const resultado = evaluacion?.resultado || "pendiente";
  const vencimiento = evaluacion?.fechaVencimiento;
  const dias = vencimiento ? diasRestantes(vencimiento) : null;
  const estadoVencimiento = dias !== null ? estadoPorDiasRestantes(dias) : null;

  return (
    <View style={styles.row}>
      {numero ? (
        <View style={styles.numero}>
          <Text style={[typography.caption, { color: colors.muted }]}>{numero}</Text>
        </View>
      ) : null}
      <FileText color={colors.muted} size={18} style={styles.icon} />
      <View style={styles.info}>
        <Text style={[typography.body, { color: colors.ink }]} numberOfLines={2}>
          {nombre}
        </Text>
        {vencimiento && (
          <Text style={[typography.caption, { color: estadoVencimiento?.fg || colors.muted }]}>
            Vence {formatFecha(vencimiento)}
          </Text>
        )}
      </View>
      <StatusPill estado={estadoResultado(resultado)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  numero: {
    width: 20, alignItems: "center",
  },
  icon: { marginTop: 2 },
  info: { flex: 1, gap: 2 },
});
