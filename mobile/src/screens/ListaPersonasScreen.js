import React, { useMemo, useState } from "react";
import { View, FlatList, TouchableOpacity, Text, StyleSheet } from "react-native";
import { useAsync } from "../hooks/useAsync";
import { useListPaging } from "../hooks/useListPaging";
import { personaService } from "../services/personaService";
import { colors } from "../theme/colors";
import { spacing, radius, minTouchTarget } from "../theme/spacing";
import { typography } from "../theme/typography";
import { formatRut } from "../utils/formatRut";
import { formatNombre } from "../utils/formatNombre";
import { GradientHeader } from "../components/GradientHeader";
import { SearchBar } from "../components/SearchBar";
import { FilterChips } from "../components/FilterChips";
import { ListRow } from "../components/ListRow";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { SkeletonList } from "../components/Skeleton";

// GAP conocido (auditoría Fase A/B): no existe un "estado de acreditación"
// agregado por Persona fuera de un Proyecto puntual — se mantiene el
// estado Activo/Inactivo real (no se inventa una acreditación).
const ESTADOS = [
  { value: null, label: "Todas" },
  { value: "activo", label: "Activas" },
  { value: "inactivo", label: "Inactivas" },
];

// Empresa actual: la de la relación activa (empresaActual), ya resuelta por la API.
function PersonaRow({ item, onPress }) {
  const empresaNombre = item.empresaActual?.empresaNombre || null;
  return (
    <ListRow
      entity="personas"
      titulo={formatNombre(`${item.nombre} ${item.apellido}`)}
      subtituloMono={item.identificacion?.tipo === "RUT" ?
        formatRut(item.identificacion.numero) : item.identificacion?.numero}
      meta={empresaNombre}
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

export default function ListaPersonasScreen({ navigation, route }) {
  const [busqueda, setBusqueda] = useState(route.params?.busquedaInicial || "");
  const [estado, setEstado] = useState(null);

  const { data, loading, refreshing, error, refresh } = useAsync(
      () => personaService.listar({ estado }), [estado],
  );

  const filtrados = useMemo(() => {
    if (!data) return [];
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return data;
    return data.filter((p) => {
      const nombreCompleto = `${p.nombre} ${p.apellido}`.toLowerCase();
      return nombreCompleto.includes(texto) ||
        p.identificacion?.numero?.toLowerCase().includes(texto);
    });
  }, [data, busqueda]);

  const { visibles, hayMas, cargarMas } = useListPaging(filtrados);

  return (
    <View style={styles.screen}>
      <GradientHeader variant="detail" title={`Personas${data ? ` (${filtrados.length})` : ""}`} />
      <View style={styles.body}>
        <View style={styles.filtros}>
          <SearchBar value={busqueda} onChangeText={setBusqueda} placeholder="Buscar persona o RUT..." />
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
              <PersonaRow
                item={item}
                onPress={() => navigation.navigate("DetallePersona", { personaId: item.id })}
              />
            )}
            ListEmptyComponent={<EmptyState message="No hay personas para este filtro." />}
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
