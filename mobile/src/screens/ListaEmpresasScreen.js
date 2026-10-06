import React, { useMemo, useState } from "react";
import { View, FlatList, TouchableOpacity, Text, StyleSheet } from "react-native";
import { Check } from "lucide-react-native";
import { useAsync } from "../hooks/useAsync";
import { useListPaging } from "../hooks/useListPaging";
import { empresaService } from "../services/empresaService";
import { reportesApi } from "../api/reportes";
import { participacionesApi } from "../api/participaciones";
import { colors } from "../theme/colors";
import { spacing, radius, minTouchTarget } from "../theme/spacing";
import { typography } from "../theme/typography";
import { formatRut } from "../utils/formatRut";
import { GradientHeader } from "../components/GradientHeader";
import { SearchBar } from "../components/SearchBar";
import { FilterChips } from "../components/FilterChips";
import { ListRow } from "../components/ListRow";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { SkeletonList } from "../components/Skeleton";
import { estadoExpediente, bucketAcreditacion } from "../theme/status";

const BUCKETS = [
  { value: null, label: "Todas" },
  { value: "acreditadas", label: "Acreditadas" },
  { value: "enProceso", label: "En proceso" },
  { value: "observadas", label: "Con observaciones" },
];

export default function ListaEmpresasScreen({ navigation, route }) {
  const [busqueda, setBusqueda] = useState(route.params?.busquedaInicial || "");
  const [bucket, setBucket] = useState(route.params?.estadoInicial || null);
  const [orden, setOrden] = useState(false); // false = alfabético, true = menor cumplimiento primero

  const { data, loading, refreshing, error, refresh } = useAsync(
      async () => {
        const [empresas, resumen, participaciones] = await Promise.all([
          empresaService.listar({ estado: "activo" }),
          reportesApi.resumen({}),
          participacionesApi.listar({ estado: "activa" }),
        ]);
        const porEmpresa = {};
        (resumen.porEmpresa || []).forEach((fila) => {
          porEmpresa[fila.empresaId] = fila;
        });
        // "N proyectos" (de la v2): proyectos distintos por empresa, a
        // partir de las Participaciones ya cargadas (sin endpoint nuevo).
        const proyectosPorEmpresa = {};
        participaciones.forEach((p) => {
          if (!proyectosPorEmpresa[p.empresaId]) proyectosPorEmpresa[p.empresaId] = new Set();
          proyectosPorEmpresa[p.empresaId].add(p.proyectoId);
        });
        return { empresas, porEmpresa, proyectosPorEmpresa };
      },
      [],
  );

  const filtrados = useMemo(() => {
    if (!data) return [];
    const texto = busqueda.trim().toLowerCase();
    let lista = data.empresas.map((e) => ({
      ...e,
      cumplimiento: data.porEmpresa[e.id] || null,
      nProyectos: data.proyectosPorEmpresa[e.id]?.size || 0,
    }));
    if (texto) {
      lista = lista.filter((e) =>
        e.razonSocial?.toLowerCase().includes(texto) ||
        e.rut?.toLowerCase().includes(texto));
    }
    if (bucket) {
      lista = lista.filter(
          (e) => bucketAcreditacion(e.cumplimiento?.expedienteEstado) === bucket,
      );
    }
    if (orden) {
      lista = [...lista].sort((a, b) => {
        const pa = a.cumplimiento?.avancePct;
        const pb = b.cumplimiento?.avancePct;
        if (pa === null || pa === undefined) return 1;
        if (pb === null || pb === undefined) return -1;
        return pa - pb;
      });
    } else {
      lista = [...lista].sort((a, b) =>
        (a.razonSocial || "").localeCompare(b.razonSocial || ""));
    }
    return lista;
  }, [data, busqueda, bucket, orden]);

  const { visibles, hayMas, cargarMas } = useListPaging(filtrados);

  return (
    <View style={styles.screen}>
      <GradientHeader variant="detail" title={`Empresas${data ? ` (${filtrados.length})` : ""}`} />
      <View style={styles.body}>
        <View style={styles.filtros}>
          <SearchBar value={busqueda} onChangeText={setBusqueda} placeholder="Buscar empresa o RUT..." />
          <FilterChips options={BUCKETS} value={bucket} onChange={setBucket} />
          <TouchableOpacity onPress={() => setOrden((o) => !o)} style={styles.ordenBtn}>
            {orden && <Check color={colors.primary} size={14} />}
            <Text style={[typography.body, { color: colors.primary }]}>
              Menor cumplimiento primero
            </Text>
          </TouchableOpacity>
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
              <ListRow
                entity="empresas"
                titulo={item.razonSocial}
                subtituloMono={formatRut(item.rut)}
                meta={`${item.nProyectos} proyecto${item.nProyectos === 1 ? "" : "s"}`}
                estado={item.cumplimiento ?
                  estadoExpediente(item.cumplimiento.expedienteEstado) : null}
                extra={item.cumplimiento?.avancePct !== null && item.cumplimiento?.avancePct !== undefined ?
                  `${Math.round(item.cumplimiento.avancePct)}%` : null}
                onPress={() => navigation.navigate("DetalleEmpresa", { empresaId: item.id })}
              />
            )}
            ListEmptyComponent={<EmptyState message="No hay empresas para este filtro." />}
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
  ordenBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.sm, marginBottom: spacing.sm },
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
