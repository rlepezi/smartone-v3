import React, { useMemo, useState } from "react";
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { Briefcase } from "lucide-react-native";
import { useMandante } from "../contexts/MandanteContext";
import { useAsync } from "../hooks/useAsync";
import { personaService } from "../services/personaService";
import { proyectosApi } from "../api/proyectos";
import { colors, entityColors } from "../theme/colors";
import { spacing, radius } from "../theme/spacing";
import { typography } from "../theme/typography";
import { formatRut } from "../utils/formatRut";
import { formatNombre } from "../utils/formatNombre";
import { diasRestantes } from "../utils/fechas";
import { GradientHeader } from "../components/GradientHeader";
import { SectionCard } from "../components/SectionCard";
import { ProgressRow } from "../components/ProgressRow";
import { ResultCounters } from "../components/ResultCounters";
import { StatusPill } from "../components/StatusPill";
import { ReqRow } from "../components/ReqRow";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { SkeletonCard } from "../components/Skeleton";

const UMBRAL_AVISO_DIAS = 30;

function iniciales(nombre, apellido) {
  return `${nombre?.[0] || ""}${apellido?.[0] || ""}`.toUpperCase();
}

// "Acreditada" a nivel de ESTA persona en ESTA asignación: no viene
// servido por ningún endpoint — se deriva con el mismo criterio que
// reporteService._contarAcreditados en el backend (sin no_cumple ni
// pendiente, y todos los requerimientos propios resueltos).
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

export default function DetallePersonaScreen({ route, navigation }) {
  const { personaId } = route.params;
  const { mandanteId } = useMandante();

  const base = useAsync(() => personaService.obtenerDetalle(personaId), [personaId]);
  const [asignacionIdx, setAsignacionIdx] = useState(0);
  const asignaciones = base.data?.resumen?.participacionesActivas || [];
  const asignacionActiva = asignaciones[asignacionIdx] || null;

  const proyectoActivo = useAsync(async () => {
    if (!asignacionActiva) return null;
    return proyectosApi.obtener(asignacionActiva.proyectoId);
  }, [asignacionActiva?.proyectoId]);

  const detalle = useAsync(async () => {
    if (!asignacionActiva?.empresaId) return null;
    return personaService.obtenerDetalleParticipacion(
        mandanteId, personaId, asignacionActiva.empresaId,
        asignacionActiva.proyectoId, asignacionActiva.perfilRecursoIds,
    );
  }, [asignacionActiva?.participacionId, mandanteId]);

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

  const { persona } = base.data;
  // Relación activa con su Empresa (null si no tiene, o si es con una Empresa fuera del alcance).
  const empresaActual = persona.empresaActual;

  return (
    <View style={styles.screen}>
      <GradientHeader variant="detail" title="Persona" onBack={() => navigation.goBack()}>
        <View style={styles.headerInfo}>
          <View style={styles.avatar}>
            <Text style={[typography.cardTitle, { color: colors.onDark }]}>
              {iniciales(persona.nombre, persona.apellido)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.cardTitle, { color: colors.onDark }]} numberOfLines={1}>
              {formatNombre(`${persona.nombre} ${persona.apellido}`)}
            </Text>
            <Text style={[typography.mono, { color: colors.accent }]}>
              {persona.identificacion?.tipo === "RUT" ?
                formatRut(persona.identificacion.numero) : persona.identificacion?.numero}
            </Text>
          </View>
        </View>
        {asignacionActiva?.perfilesRecurso?.length > 0 && (
          <View style={styles.rolPill}>
            <Briefcase color={colors.onDark} size={14} />
            <Text style={[typography.caption, { color: colors.onDark }]}>
              {asignacionActiva.perfilesRecurso.map((p) => p.nombre).join(", ")}
            </Text>
          </View>
        )}
      </GradientHeader>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={<RefreshControl refreshing={base.refreshing} onRefresh={base.refresh} />}
      >
        <SectionCard title="Empresa actual">
          <Text style={[typography.body, { color: colors.ink }]}>
            {empresaActual?.empresaNombre || "—"}
          </Text>
          {empresaActual?.cargo && (
            <Text style={[typography.caption, { color: colors.muted }]}>
              {empresaActual.cargo}
            </Text>
          )}
        </SectionCard>

        {asignaciones.length === 0 && (
          <EmptyState title="Sin asignaciones" message="Esta persona no tiene asignaciones activas." />
        )}

        {asignaciones.length > 0 && (
          <SectionCard title="Asignaciones activas">
            {asignaciones.length > 1 && (
              <View style={styles.selector}>
                {asignaciones.map((a, i) => (
                  <TouchableOpacity
                    key={`${a.proyectoId}-${i}`}
                    onPress={() => setAsignacionIdx(i)}
                    style={[styles.chip, i === asignacionIdx && styles.chipActivo]}
                  >
                    <Text style={{ color: i === asignacionIdx ? colors.onDark : colors.ink }}>
                      {a.proyectoNombre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {proyectoActivo.data?.codigo && (
              <Text style={[typography.mono, styles.codigoProyecto]}>
                {proyectoActivo.data.codigo}
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
              <EmptyState message="Este perfil no tiene requerimientos de persona." />
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
  headerInfo: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: entityColors.personas.color,
    alignItems: "center", justifyContent: "center",
  },
  rolPill: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    alignSelf: "flex-start",
  },
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
