import React, { useMemo, useState } from "react";
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { useMandante } from "../contexts/MandanteContext";
import { useAsync } from "../hooks/useAsync";
import { recursoService } from "../services/recursoService";
import { empresasApi } from "../api/empresas";
import { proyectosApi } from "../api/proyectos";
import { colors } from "../theme/colors";
import { spacing, radius } from "../theme/spacing";
import { typography } from "../theme/typography";
import { diasRestantes } from "../utils/formatDate";
import { GradientHeader } from "../components/GradientHeader";
import { SectionCard } from "../components/SectionCard";
import { ProgressRow } from "../components/ProgressRow";
import { ResultCounters } from "../components/ResultCounters";
import { StatusPill } from "../components/StatusPill";
import { ReqRow } from "../components/ReqRow";
import { PlateChip } from "../components/PlateChip";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { SkeletonCard } from "../components/Skeleton";

const UMBRAL_AVISO_DIAS = 30;

function calcularAvance(filas) {
  let cumple = 0; let noCumple = 0; let pendiente = 0; let noAplica = 0;
  filas.forEach(({ evaluacion }) => {
    const r = evaluacion?.resultado || "pendiente";
    if (r === "cumple") cumple++;
    else if (r === "no_cumple") noCumple++;
    else if (r === "no_aplica") noAplica++;
    else pendiente++;
  });
  const evaluables = filas.length - noAplica;
  const avancePct = evaluables > 0 ? (cumple / evaluables) * 100 : null;
  const acreditada = filas.length > 0 && noCumple === 0 && pendiente === 0;
  return { cumple, noCumple, pendiente, noAplica, avancePct, acreditada };
}

export default function DetalleMaquinariaScreen({ route, navigation }) {
  const { recursoId } = route.params;
  const { mandanteId } = useMandante();

  const base = useAsync(() => recursoService.obtener(recursoId), [recursoId]);

  const empresaActual = useAsync(async () => {
    if (!base.data?.empresaId) return null;
    return empresasApi.obtener(base.data.empresaId);
  }, [base.data?.empresaId]);

  // recursoController no expone /:id/resumen (ver auditoría Fase A): las
  // participaciones activas se resuelven acá contra /participacion-recursos.
  const asignaciones = useAsync(async () => {
    const activas = await recursoService.obtenerParticipacionesActivas(recursoId);
    const proyectos = await Promise.all(
        activas.map((a) => proyectosApi.obtener(a.proyectoId).catch(() => null)),
    );
    return activas.map((a, i) => ({ ...a, proyecto: proyectos[i] }));
  }, [recursoId]);

  const [asignacionIdx, setAsignacionIdx] = useState(0);
  const asignacionActiva = (asignaciones.data || [])[asignacionIdx] || null;

  const detalle = useAsync(async () => {
    if (!asignacionActiva) return null;
    return recursoService.obtenerDetalleParticipacion(
        mandanteId, recursoId, asignacionActiva.empresaId, asignacionActiva.proyectoId,
        asignacionActiva.perfilRecursoIds,
    );
  }, [asignacionActiva?.proyectoId, mandanteId]);

  const avance = useMemo(
      () => calcularAvance(detalle.data?.filas || []),
      [detalle.data],
  );

  const porVencer = useMemo(() => {
    return (detalle.data?.filas || []).filter(({ evaluacion }) => {
      if (!evaluacion?.fechaVencimiento) return false;
      const dias = diasRestantes(evaluacion.fechaVencimiento);
      return dias !== null && dias <= UMBRAL_AVISO_DIAS;
    });
  }, [detalle.data]);

  if (base.loading && !base.data) return <SkeletonCard height={320} />;
  if (base.error && !base.data) return <ErrorState message={base.error.message} onRetry={base.reload} />;
  if (!base.data) return null;

  const recurso = base.data;

  return (
    <View style={styles.screen}>
      <GradientHeader variant="detail" title="Maquinaria" onBack={() => navigation.goBack()}>
        <Text style={[typography.cardTitle, { color: colors.onDark }]}>
          {recurso.tipo}
        </Text>
        <Text style={[typography.body, { color: colors.accent }]}>
          {[recurso.marca, recurso.modelo].filter(Boolean).join(" ")}
        </Text>
        <PlateChip patente={recurso.patente} size="lg" />
      </GradientHeader>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={<RefreshControl refreshing={base.refreshing} onRefresh={base.refresh} />}
      >
        <SectionCard title="Empresa actual">
          <Text style={[typography.body, { color: colors.ink }]}>
            {empresaActual.data?.razonSocial || "—"}
          </Text>
        </SectionCard>

        {!asignaciones.loading && (asignaciones.data || []).length === 0 && (
          <EmptyState title="Sin asignaciones" message="Esta máquina no tiene asignaciones activas." />
        )}

        {(asignaciones.data || []).length > 0 && (
          <SectionCard title="Asignaciones activas">
            {asignaciones.data.length > 1 && (
              <View style={styles.selector}>
                {asignaciones.data.map((a, i) => (
                  <TouchableOpacity
                    key={a.id}
                    onPress={() => setAsignacionIdx(i)}
                    style={[styles.chip, i === asignacionIdx && styles.chipActivo]}
                  >
                    <Text style={{ color: i === asignacionIdx ? colors.onDark : colors.ink }}>
                      {a.proyecto?.nombre || a.proyectoId}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {asignacionActiva?.proyecto?.codigo && (
              <Text style={[typography.mono, styles.codigoProyecto]}>
                {asignacionActiva.proyecto.codigo}
              </Text>
            )}

            {detalle.loading && !detalle.data && <SkeletonCard height={100} />}
            {detalle.error && !detalle.data && (
              <ErrorState message={detalle.error.message} onRetry={detalle.reload} />
            )}
            {detalle.data && (
              <>
                <ProgressRow
                  pct={avance.avancePct}
                  ratio={{ num: avance.cumple, den: detalle.data.filas.length }}
                />
                <View style={styles.mt}>
                  <ResultCounters
                    cumple={avance.cumple}
                    noCumple={avance.noCumple}
                    pendiente={avance.pendiente}
                  />
                </View>
                {avance.avancePct !== null && (
                  <View style={styles.mt}>
                    <StatusPill estado={avance.acreditada ?
                      { label: "Acreditada", fg: "#15803D", bar: "#16A34A", bg: "#DCF5E7" } :
                      { label: "En proceso", fg: "#A16207", bar: "#F2B01E", bg: "#FEF4D6" }} />
                  </View>
                )}
              </>
            )}
          </SectionCard>
        )}

        {porVencer.length > 0 && (
          <SectionCard title="Documentos por vencer">
            {porVencer.map(({ requerimiento, evaluacion }, i) => (
              <ReqRow
                key={requerimiento.requerimientoId}
                numero={i + 1}
                nombre={requerimiento.nombre}
                evaluacion={evaluacion}
              />
            ))}
          </SectionCard>
        )}

        {asignacionActiva && detalle.data && (
          <SectionCard title="Requerimientos">
            {detalle.data.filas.length === 0 ? (
              <EmptyState message="Este perfil no tiene requerimientos de maquinaria." />
            ) : (
              detalle.data.filas.map(({ requerimiento, evaluacion }, i) => (
                <ReqRow
                  key={requerimiento.requerimientoId}
                  numero={i + 1}
                  nombre={requerimiento.nombre}
                  evaluacion={evaluacion}
                />
              ))
            )}
          </SectionCard>
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
  selector: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  codigoProyecto: { color: colors.muted, marginBottom: spacing.sm },
  mt: { marginTop: spacing.md },
});
