import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
} from "react-native";
import { ShieldCheck, LogOut } from "lucide-react-native";
import { useAuth } from "../contexts/AuthContext";
import { useMandante } from "../contexts/MandanteContext";
import { useAsync } from "../hooks/useAsync";
import { dashboardService } from "../services/dashboardService";
import { colors } from "../theme/colors";
import { ESTADO_RESULTADO } from "../theme/status";
import { spacing, radius } from "../theme/spacing";
import { typography } from "../theme/typography";
import { GradientHeader } from "../components/GradientHeader";
import { RoleSelector } from "../components/RoleSelector";
import { SectionCard } from "../components/SectionCard";
import { SearchBar } from "../components/SearchBar";
import { StatusBarStacked } from "../components/StatusBarStacked";
import { StatusCounters } from "../components/StatusCounters";
import { EntityCard } from "../components/EntityCard";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { SkeletonCard } from "../components/Skeleton";
import { getMandanteDisplayName } from "../utils/mandanteDisplay";

export default function InicioScreen({ navigation }) {
  const { rol, logout } = useAuth();
  const { mandanteId, mandantes, setMandanteId, puedeSeleccionar } = useMandante();
  const [busqueda, setBusqueda] = useState("");

  const { data, loading, refreshing, error, refresh } = useAsync(
      () => dashboardService.obtenerResumen({ mandanteId }),
      [mandanteId],
  );

  const irABusqueda = () => {
    if (!busqueda.trim()) return;
    navigation.navigate("Empresas", {
      screen: "ListaEmpresas", params: { busquedaInicial: busqueda.trim() },
    });
  };

  const irAEmpresasFiltradas = (estadoExpediente) => {
    navigation.navigate("Empresas", {
      screen: "ListaEmpresas", params: { estadoInicial: estadoExpediente },
    });
  };

  const rotarMandante = () => {
    if (!puedeSeleccionar || mandantes.length < 2) return;
    const idx = mandantes.findIndex((m) => m.id === mandanteId);
    setMandanteId(mandantes[(idx + 1) % mandantes.length].id);
  };

  const mandanteActual = mandantes.find((m) => m.id === mandanteId);

  return (
    <View style={styles.screen}>
      <GradientHeader
        variant="home"
        mandanteNombre={getMandanteDisplayName(mandanteActual)}
        right={(
          <View style={styles.headerRight}>
            <RoleSelector rol={rol} onPress={rotarMandante} />
            <TouchableOpacity
              onPress={logout}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <LogOut color={colors.onDark} size={20} />
            </TouchableOpacity>
          </View>
        )}
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <SearchBar
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar empresa, persona, máquina..."
        />
        {busqueda.trim() ? (
          <TouchableOpacity onPress={irABusqueda} style={styles.buscarBtn}>
            <Text style={[typography.body, { color: colors.onDark }]}>
              Buscar {'"'}{busqueda.trim()}{'"'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {loading && !data ? <SkeletonCard height={220} /> : null}
        {error && !data ? (
          <ErrorState message={error.message} onRetry={refresh} />
        ) : null}

        {data && (
          <>
            <SectionCard>
              <View style={styles.tituloCard}>
                <ShieldCheck color={colors.primary} size={22} />
                <View>
                  <Text style={[typography.cardTitle, { color: colors.ink }]}>
                    Estado de acreditación
                  </Text>
                  <Text style={[typography.caption, { color: colors.muted }]}>
                    Resumen general de cumplimiento · de {data.acreditacion?.total ?? 0} expedientes
                  </Text>
                </View>
              </View>

              <View style={styles.bar}>
                <StatusBarStacked
                  segments={[
                    { value: data.acreditacion?.acreditadas || 0, color: ESTADO_RESULTADO.cumple.bar },
                    { value: data.acreditacion?.enProceso || 0, color: ESTADO_RESULTADO.pendiente.bar },
                    { value: data.acreditacion?.observadas || 0, color: ESTADO_RESULTADO.no_cumple.bar },
                  ]}
                />
              </View>

              <StatusCounters
                items={[
                  {
                    value: data.acreditacion?.acreditadas || 0,
                    label: "Acreditadas",
                    fg: ESTADO_RESULTADO.cumple.fg,
                    bar: ESTADO_RESULTADO.cumple.bar,
                    onPress: () => irAEmpresasFiltradas("acreditadas"),
                  },
                  {
                    value: data.acreditacion?.enProceso || 0,
                    label: "En proceso",
                    fg: ESTADO_RESULTADO.pendiente.fg,
                    bar: ESTADO_RESULTADO.pendiente.bar,
                    onPress: () => irAEmpresasFiltradas("enProceso"),
                  },
                  {
                    value: data.acreditacion?.observadas || 0,
                    label: "Con observaciones",
                    fg: ESTADO_RESULTADO.no_cumple.fg,
                    bar: ESTADO_RESULTADO.no_cumple.bar,
                    onPress: () => irAEmpresasFiltradas("observadas"),
                  },
                  {
                    // "Vencidos" cuenta documentos/evaluaciones vencidas
                    // (GET /reportes/resumen -> vencimientos.vencido), NO
                    // empresas/expedientes: es otra unidad, por eso no
                    // suma en la barra apilada de arriba ni abre una
                    // lista filtrada (no existe pantalla de vencimientos
                    // en esta entrega). Ver Fase A, hallazgo del 4to
                    // contador.
                    value: data.vencimientos?.vencido || 0,
                    label: "Vencidos",
                    fg: "#C2410C",
                    bar: "#EA6A1B",
                  },
                ]}
              />
            </SectionCard>

            <View style={styles.grid}>
              <EntityCard
                entity="proyectos" value={data.conteos.proyectos} label="Proyectos"
                onPress={() => navigation.navigate("Proyectos", { screen: "ListaProyectos" })}
              />
              <EntityCard
                entity="empresas" value={data.conteos.empresas} label="Empresas"
                onPress={() => navigation.navigate("Empresas", { screen: "ListaEmpresas" })}
              />
              <EntityCard
                entity="personas" value={data.conteos.personas} label="Personas"
                onPress={() => navigation.navigate("Personas", { screen: "ListaPersonas" })}
              />
              <EntityCard
                entity="maquinas" value={data.conteos.recursos} label="Máquinas"
                onPress={() => navigation.navigate("Máquinas", { screen: "ListaMaquinas" })}
              />
            </View>
          </>
        )}

        {data && data.conteos.empresas === 0 && (
          <EmptyState
            title="Todavía no hay datos"
            message="No hay empresas registradas para este mandante."
          />
        )}
      </ScrollView>
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
  bodyContent: { padding: spacing.lg },
  buscarBtn: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: radius.card,
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  tituloCard: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg, alignItems: "center" },
  bar: { marginBottom: spacing.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
});
