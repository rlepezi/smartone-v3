import React, { useMemo } from "react";
import { ScrollView, View, Text, StyleSheet, RefreshControl } from "react-native";
import { useAsync } from "../hooks/useAsync";
import { proyectoService } from "../services/proyectoService";
import { reportesApi } from "../api/reportes";
import { colors } from "../theme/colors";
import { entityIcons } from "../theme/entityIcons";
import { estadoExpediente } from "../theme/status";
import { spacing, radius } from "../theme/spacing";
import { typography } from "../theme/typography";
import { formatFecha } from "../utils/fechas";
import { GradientHeader } from "../components/GradientHeader";
import { SectionCard } from "../components/SectionCard";
import { ProgressRow } from "../components/ProgressRow";
import { InfoGrid } from "../components/InfoGrid";
import { EntityCard } from "../components/EntityCard";
import { StatusPill } from "../components/StatusPill";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { SkeletonCard } from "../components/Skeleton";

export default function DetalleProyectoScreen({ route, navigation }) {
  const { proyectoId } = route.params;

  const { data, loading, refreshing, error, refresh } = useAsync(
      async () => {
        const [detalle, resumenProyecto, resumenGlobal] = await Promise.all([
          proyectoService.obtenerDetalle(proyectoId),
          // Ratio real x/y a nivel proyecto — GET /reportes/resumen?proyectoId=
          // (existe en api/reportes.js), evita el promedio simple entre
          // empresas que se usaba antes (ver auditoría Fase A/B).
          reportesApi.resumen({ proyectoId }),
          // Estado de acreditación por empresa: GET /reportes/proyectos/:id/
          // participantes no trae expedienteEstado, solo cumplimientoPct —
          // se resuelve cruzando con /reportes/resumen global. Si una
          // empresa participa en más de un proyecto esto puede no ser
          // exacto a ESTE proyecto puntual (gap documentado en Fase A/B).
          reportesApi.resumen({}),
        ]);
        const estadoPorEmpresa = {};
        (resumenGlobal.porEmpresa || []).forEach((f) => {
          estadoPorEmpresa[f.empresaId] = f.expedienteEstado;
        });
        return { ...detalle, resumenProyecto, estadoPorEmpresa };
      },
      [proyectoId],
  );

  const Icon = entityIcons.proyectos;

  const activas = useMemo(
      () => (data?.participantes || []).filter((p) => p.estado === "activa").length,
      [data],
  );

  if (loading && !data) return <SkeletonCard height={320} />;
  if (error && !data) return <ErrorState message={error.message} onRetry={refresh} />;
  if (!data) return null;

  const { proyecto, resumen, participantes, resumenProyecto, estadoPorEmpresa } = data;
  const req = resumenProyecto.requerimientos;

  return (
    <View style={styles.screen}>
      <GradientHeader variant="detail" title="Proyecto" onBack={() => navigation.goBack()}>
        <View style={styles.headerInfo}>
          <View style={[styles.iconCircle, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
            <Icon color={colors.onDark} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.cardTitle, { color: colors.onDark }]} numberOfLines={2}>
              {proyecto.nombre}
            </Text>
            <Text style={[typography.mono, { color: colors.accent }]}>{proyecto.codigo}</Text>
          </View>
        </View>
        <View style={styles.estadoRow}>
          <View style={styles.estadoPill}>
            <Text style={[typography.caption, { color: colors.onDark }]}>
              {proyecto.estado.replace("_", " ")}
            </Text>
          </View>
        </View>
      </GradientHeader>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <InfoGrid
          items={[
            { label: "Inicio de contrato", value: formatFecha(proyecto.fechaInicio) },
            { label: "Fin de contrato", value: formatFecha(proyecto.fechaTermino) },
          ]}
        />

        <SectionCard title="Cumplimiento agregado" style={styles.mtLg}>
          <ProgressRow
            pct={req.avancePct}
            ratio={{ num: req.cumple, den: req.cumple + req.noCumple + req.pendiente + req.noAplica }}
          />
        </SectionCard>

        <View style={styles.grid}>
          <EntityCard compact entity="empresas" value={resumen.empresasCount} label="Empresas" />
          <EntityCard compact entity="personas" value={resumen.personasCount} label="Personas" />
          <EntityCard compact entity="maquinas" value={resumen.recursosCount} label="Máquinas" />
        </View>

        <SectionCard
          title="Empresas participantes"
          action={(
            <View style={styles.activasPill}>
              <Text style={[typography.caption, { color: "#15803D" }]}>{activas} activas</Text>
            </View>
          )}
        >
          {participantes.length === 0 ? (
            <EmptyState message="Este proyecto no tiene empresas con participación activa." />
          ) : (
            participantes.map((p) => (
              <View key={p.empresaId} style={styles.empresaRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.body, { color: colors.ink }]} numberOfLines={1}>
                    {p.empresaNombre}
                  </Text>
                  <Text style={[typography.caption, { color: colors.muted }]}>
                    {p.estado === "activa" ? "Activa" : "Finalizada"}
                  </Text>
                </View>
                <View style={styles.empresaAside}>
                  {p.cumplimientoPct !== null && p.cumplimientoPct !== undefined ? (
                    <Text style={[typography.body, { color: colors.ink, fontWeight: "700" }]}>
                      {Math.round(p.cumplimientoPct)}%
                    </Text>
                  ) : null}
                  <StatusPill estado={
                    estadoPorEmpresa[p.empresaId] ?
                      estadoExpediente(estadoPorEmpresa[p.empresaId]) : null
                  } />
                </View>
              </View>
            ))
          )}
        </SectionCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerInfo: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconCircle: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  estadoRow: { flexDirection: "row" },
  estadoPill: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  body: {
    flex: 1,
    marginTop: -radius.headerOverlap,
    borderTopLeftRadius: radius.headerOverlap,
    borderTopRightRadius: radius.headerOverlap,
    backgroundColor: colors.bg,
  },
  bodyContent: { padding: spacing.lg },
  mtLg: { marginTop: spacing.lg },
  grid: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  activasPill: { backgroundColor: "#DCF5E7", borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  empresaRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  empresaAside: { alignItems: "flex-end", gap: spacing.xs },
});
