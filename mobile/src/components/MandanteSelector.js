import React, { useState } from "react";
import { Text, TouchableOpacity, Modal, ScrollView, StyleSheet, Pressable } from "react-native";
import { ChevronDown, Check } from "lucide-react-native";
import { useMandante } from "../contexts/MandanteContext";
import { colors } from "../theme/colors";
import { spacing, radius, minTouchTarget } from "../theme/spacing";
import { typography, MAX_FONT_SCALE } from "../theme/typography";
import { getMandanteDisplayName } from "../utils/mandanteDisplay";

// Nombre del Mandante en contexto ("Todos los mandantes" si no hay uno elegido).
export function useNombreMandante() {
  const { mandanteId, mandantes } = useMandante();
  if (!mandanteId) return mandantes.length ? "Todos los mandantes" : "";
  return getMandanteDisplayName(mandantes.find((m) => m.id === mandanteId)) || "";
}

// Selector de Mandante (header de Inicio). Solo se puede tocar si el rol puede elegir y hay más
// de un Mandante; si no, muestra el nombre fijo.
export function MandanteSelector() {
  const { mandanteId, mandantes, setMandanteId, puedeSeleccionar, puedeVerTodos } = useMandante();
  const [abierto, setAbierto] = useState(false);
  const nombre = useNombreMandante();
  if (!nombre) return null;

  const opciones = [
    ...(puedeVerTodos ? [{ id: null, nombre: "Todos los mandantes" }] : []),
    ...mandantes.map((m) => ({ id: m.id, nombre: getMandanteDisplayName(m) || m.id })),
  ];
  const elegir = (id) => { setMandanteId(id); setAbierto(false); };

  return (
    <>
      <TouchableOpacity style={styles.pill} disabled={!puedeSeleccionar} onPress={() => setAbierto(true)}
        accessibilityLabel={`Mandante: ${nombre}`}>
        <Text style={[typography.caption, styles.texto]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>{nombre}</Text>
        {puedeSeleccionar ? <ChevronDown color={colors.onDark} size={16} /> : null}
      </TouchableOpacity>
      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <Pressable style={styles.fondo} onPress={() => setAbierto(false)}>
          <Pressable style={styles.hoja}>
            <Text style={[typography.cardTitle, { color: colors.text }]}>Mandante</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {opciones.map((o) => {
                const activo = o.id === (mandanteId ?? null);
                return (
                  <TouchableOpacity key={o.id || "todos"} style={styles.opcion} onPress={() => elegir(o.id)}>
                    <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{o.nombre}</Text>
                    {activo ? <Check color={colors.primary} size={18} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start",
    minHeight: 32, maxWidth: "100%", paddingHorizontal: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.onDarkSurface,
  },
  texto: { color: colors.onDark, flexShrink: 1 },
  fondo: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  hoja: {
    backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.sm,
    borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card,
  },
  opcion: {
    minHeight: minTouchTarget, flexDirection: "row", alignItems: "center",
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
});
