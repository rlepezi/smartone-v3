import React, { useMemo, useState } from "react";
import { View, FlatList, TouchableOpacity, Text, StyleSheet } from "react-native";
import { useAsync } from "../hooks/useAsync";
import { useListPaging } from "../hooks/useListPaging";
import { recursoService } from "../services/recursoService";
import { colors } from "../theme/colors";
import { spacing, radius, minTouchTarget } from "../theme/spacing";
import { typography } from "../theme/typography";
import { GradientHeader } from "../components/GradientHeader";
import { SearchBar } from "../components/SearchBar";
import { FilterChips } from "../components/FilterChips";
import { ListRow } from "../components/ListRow";
import { PlateChip } from "../components/PlateChip";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { SkeletonList } from "../components/Skeleton";

// GAP conocido: no existe "estado de acreditación" agregado por Máquina
// fuera de un Proyecto puntual — se mantiene el estado Activo/Inactivo real.
const ESTADOS = [
  { value: null, label: "Todas" },
  { value: "activo", label: "Activas" },
  { value: "inactivo", label: "Inactivas" },
];

// Empresa actual: la de la relación activa (empresaActual), ya resuelta por la API.
function MaquinaRow({ item, onPress }) {
  const empresaNombre = item.empresaActual?.empresaNombre || null;
  return (
    <ListRow
      entity="maquinas"
      titulo={item.nombre}
      subtituloMono={[item.marca, item.modelo].filter(Boolean).join(" ") || item.tipo}
      metaNode={(
        <View style={styles.metaRow}>
          <PlateChip patente={item.patente} />
          {empresaNombre ? (
            <Text style={[typography.caption, { color: colors.muted }]} numberOfLines={1}>
              {empresaNombre}
            </Text>
          ) : null}
        </View>
      )}
      estado={{
        label: item.estado === "activo" ? "Activo" : "Inactivo",
        fg: item.estado === "activo" ? "#15803D" : colors.muted,
        bar: item.estado === "activo" ? "#16A34A" : null,
        bg: item.estado === "activo" ? "#DCF5E7" : colors.bg,
      }}
      onPress={onPress}
    />
  );
}

export default function ListaMaquinasScreen({ navigation, route }) {
  const [busqueda, setBusqueda] = useState(route.params?.busquedaInicial || "");
  const [estado, setEstado] = useState(null);

  const { data, loading, refreshing, error, refresh } = useAsync(
      () => recursoService.listar({ estado }), [estado],
  );

  const filtrados = useMemo(() => {
    if (!data) return [];
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return data;
    return data.filter((r) =>
      r.nombre?.toLowerCase().includes(texto) ||
      r.patente?.toLowerCase().includes(texto));
  }, [data, busqueda]);

  const { visibles, hayMas, cargarMas } = useListPaging(filtrados);

  return (
    <View style={styles.screen}>
      <GradientHeader variant="detail" title={`Máquinas${data ? ` (${filtrados.length})` : ""}`} />
      <View style={styles.body}>
        <View style={styles.filtros}>
          <SearchBar value={busqueda} onChangeText={setBusqueda} placeholder="Buscar máquina o patente..." />
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
              <MaquinaRow
                item={item}
                onPress={() => navigation.navigate("DetalleMaquinaria", { recursoId: item.id })}
              />
            )}
            ListEmptyComponent={<EmptyState message="No hay máquinas para este filtro." />}
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
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
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
