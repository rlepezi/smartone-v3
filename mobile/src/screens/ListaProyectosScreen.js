import React, { useEffect, useMemo, useState } from "react";
import {
  View, FlatList, TouchableOpacity, Text, StyleSheet,
} from "react-native";
import { useMandante } from "../contexts/MandanteContext";
import { useAsync } from "../hooks/useAsync";
import { useListPaging } from "../hooks/useListPaging";
import { proyectoService } from "../services/proyectoService";
import { proyectosApi } from "../api/proyectos";
import { colors } from "../theme/colors";
import { spacing, radius, minTouchTarget, shadow } from "../theme/spacing";
import { typography } from "../theme/typography";
import { GradientHeader } from "../components/GradientHeader";
import { SearchBar } from "../components/SearchBar";
import { FilterChips } from "../components/FilterChips";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { SkeletonList } from "../components/Skeleton";

// Estado propio de Proyecto (distinto del de Expediente).
const ESTADOS = [
  { value: null, label: "Todos" },
  { value: "planificado", label: "Planificado" },
  { value: "en_ejecucion", label: "En ejecución" },
  { value: "suspendido", label: "Suspendido" },
  { value: "finalizado", label: "Finalizado" },
];

const ESTADO_LABEL = {
  planificado: { label: "Planificado", fg: colors.primary, bg: "#E3EEFE" },
  en_ejecucion: { label: "En ejecución", fg: "#15803D", bg: "#DCF5E7" },
  suspendido: { label: "Suspendido", fg: "#A16207", bg: "#FEF4D6" },
  finalizado: { label: "Finalizado", fg: colors.muted, bg: colors.bg },
  archivado: { label: "Archivado", fg: colors.muted, bg: colors.bg },
};

// Mini-contadores Empresas/Personas/Máquinas (de la v2): se resuelven por
// fila, no hay un agregado en el list() — GET /proyectos/:id/resumen ya
// existe en api/proyectos.js, se llama acá directo desde la pantalla.
function useResumenProyecto(proyectoId) {
  const [resumen, setResumen] = useState(null);
  useEffect(() => {
    let activo = true;
    proyectosApi.resumen(proyectoId)
        .then((r) => activo && setResumen(r))
        .catch(() => {});
    return () => { activo = false; };
  }, [proyectoId]);
  return resumen;
}

function ProyectoRow({ item, onPress }) {
  const resumen = useResumenProyecto(item.id);
  const estado = ESTADO_LABEL[item.estado] || ESTADO_LABEL.planificado;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowHeader}>
        <View style={styles.info}>
          <Text style={[typography.body, { color: colors.ink }]} numberOfLines={1}>
            {item.nombre}
          </Text>
          <Text style={[typography.mono, { color: colors.muted }]}>{item.codigo}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: estado.bg }]}>
          <Text style={[typography.caption, { color: estado.fg }]}>{estado.label}</Text>
        </View>
      </View>
      {resumen && (
        <View style={styles.mini}>
          <Text style={[typography.caption, styles.miniText]}>
            {resumen.empresasCount} Empresas
          </Text>
          <Text style={[typography.caption, styles.miniText]}>
            {resumen.personasCount} Personas
          </Text>
          <Text style={[typography.caption, styles.miniText]}>
            {resumen.recursosCount} Máquinas
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ListaProyectosScreen({ navigation }) {
  const { mandanteId } = useMandante();
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState(null);

  const { data, loading, refreshing, error, refresh } = useAsync(
      () => proyectoService.listar({ mandanteId, estado }),
      [mandanteId, estado],
  );

  const filtrados = useMemo(() => {
    if (!data) return [];
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return data;
    return data.filter((p) =>
      p.nombre?.toLowerCase().includes(texto) ||
      p.codigo?.toLowerCase().includes(texto));
  }, [data, busqueda]);

  const { visibles, hayMas, cargarMas } = useListPaging(filtrados);

  return (
    <View style={styles.screen}>
      <GradientHeader variant="detail" title={`Proyectos${data ? ` (${filtrados.length})` : ""}`} />
      <View style={styles.body}>
        <View style={styles.filtros}>
          <SearchBar value={busqueda} onChangeText={setBusqueda} placeholder="Buscar proyecto..." />
          <FilterChips options={ESTADOS} value={estado} onChange={setEstado} />
        </View>

        {loading && !data && <SkeletonList />}
        {error && !data && <ErrorState message={error.message} onRetry={refresh} />}

        {data && (
          <FlatList
            data={visibles}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.lista}
            refreshing={refreshing}
            onRefresh={refresh}
            renderItem={({ item }) => (
              <ProyectoRow
                item={item}
                onPress={() => navigation.navigate("DetalleProyecto", { proyectoId: item.id })}
              />
            )}
            ListEmptyComponent={<EmptyState message="No hay proyectos para este filtro." />}
            ListFooterComponent={hayMas ? (
              <TouchableOpacity style={styles.masBtn} onPress={cargarMas}>
                <Text style={[typography.body, { color: colors.primary }]}>Cargar más</Text>
              </TouchableOpacity>
            ) : null}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: {
    flex: 1,
    marginTop: -radius.headerOverlap,
    borderTopLeftRadius: radius.headerOverlap,
    borderTopRightRadius: radius.headerOverlap,
    backgroundColor: colors.bg,
  },
  filtros: { padding: spacing.lg, paddingBottom: 0 },
  lista: { padding: spacing.lg },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    ...shadow,
  },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  info: { flex: 1, gap: 2 },
  pill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  mini: { flexDirection: "row", gap: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  miniText: { color: colors.muted },
  masBtn: {
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
});
