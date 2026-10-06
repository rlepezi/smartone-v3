import React, { useMemo, useState } from "react";
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { useMandante } from "../contexts/MandanteContext";
import { useAsync } from "../hooks/useAsync";
import { empresaService } from "../services/empresaService";
import { evaluacionService } from "../services/evaluacionService";
import { personasApi } from "../api/personas";
import { colors, entityColors } from "../theme/colors";
import { estadoExpediente } from "../theme/status";
import { spacing, radius } from "../theme/spacing";
import { typography } from "../theme/typography";
import { formatRut } from "../utils/formatRut";
import { formatNombre } from "../utils/formatNombre";
import { GradientHeader } from "../components/GradientHeader";
import { SectionCard } from "../components/SectionCard";
import { ProgressRow } from "../components/ProgressRow";
import { ResultCounters } from "../components/ResultCounters";
import { StatusPill } from "../components/StatusPill";
import { InfoGrid } from "../components/InfoGrid";
import { ReqRow } from "../components/ReqRow";
import { ListRow } from "../components/ListRow";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { SkeletonCard } from "../components/Skeleton";

export default function DetalleEmpresaScreen({ route, navigation }) {
  const { empresaId } = route.params;
  const { mandanteId } = useMandante();

  const base = useAsync(
      () => empresaService.obtenerDetalle(empresaId), [empresaId],
  );

  const [proyectoIdSeleccionado, setProyectoIdSeleccionado] = useState(null);
  // GET /empresas/:id/resumen ya resuelve perfilNombre, evaluacion
  // (avancePct/expedienteEstado) y personasCount/recursosCount POR
  // Participación activa — no hace falta recalcularlo a mano.
  const participacionesActivas = base.data?.resumen?.participacionesActivas || [];
  const participacionActiva = participacionesActivas.find(
      (p) => p.proyectoId === proyectoIdSeleccionado,
  ) || participacionesActivas[0] || null;

  const participacionRaw = (base.data?.participaciones || []).find(
      (p) => p.proyectoId === participacionActiva?.proyectoId,
  );

  const [filtroRol, setFiltroRol] = useState(null);

  const detalle = useAsync(async () => {
    if (!participacionActiva) return null;
    return empresaService.obtenerDetalleParticipacion(
        mandanteId, empresaId, participacionActiva.proyectoId,
    );
  }, [participacionActiva?.proyectoId, mandanteId]);

  // Une el snapshot de requerimientosAplicables del Expediente (trae
  // `nombre`) con la Evaluación de empresa — evita mostrar un id crudo.
  const filasRequerimientos = useMemo(() => {
    if (!detalle.data) return [];
    return evaluacionService.combinarConRequerimientos(
        detalle.data.expediente, detalle.data.requerimientosEmpresa,
        { tipoEntidad: "empresa" },
    );
  }, [detalle.data]);

  const avance = useMemo(() => {
    let cumple = 0; let noCumple = 0; let pendiente = 0;
    filasRequerimientos.forEach(({ evaluacion }) => {
      const r = evaluacion?.resultado || "pendiente";
      if (r === "cumple") cumple++;
      else if (r === "no_cumple") noCumple++;
      else pendiente++;
    });
    return { cumple, noCumple, pendiente };
  }, [filasRequerimientos]);

  // 4+ contadores por rol REAL (no hardcodeados): se agrupan las
  // Asignaciones de Personas por su `rol` tal como viene del backend
  // (catálogo configurable por Mandante), más un total de Máquinas.
  const contadoresRol = useMemo(() => {
    const asignaciones = detalle.data?.asignaciones || [];
    const porRol = {};
    let maquinas = 0;
    asignaciones.forEach((a) => {
      if (a.personaId) {
        const rol = a.rol || "Sin rol";
        porRol[rol] = (porRol[rol] || 0) + 1;
      } else if (a.recursoId) {
        maquinas++;
      }
    });
    const tiles = Object.entries(porRol).map(([rol, count]) => ({ key: rol, label: rol, count }));
    tiles.push({ key: "maquinas", label: "Máquinas", count: maquinas });
    return tiles;
  }, [detalle.data]);

  const asignacionesFiltradas = useMemo(() => {
    const asignaciones = detalle.data?.asignaciones || [];
    if (!filtroRol) return asignaciones;
    if (filtroRol === "maquinas") return asignaciones.filter((a) => a.recursoId);
    return asignaciones.filter((a) => a.rol === filtroRol);
  }, [detalle.data, filtroRol]);

  const nombresPersonas = useAsync(async () => {
    const ids = [...new Set(asignacionesFiltradas.filter((a) => a.personaId).map((a) => a.personaId))];
    const personas = await Promise.all(ids.map((id) => personasApi.obtener(id).catch(() => null)));
    return Object.fromEntries(ids.map((id, i) => [id, personas[i]]).filter(([, p]) => p));
  }, [asignacionesFiltradas.map((a) => a.personaId).join(",")]);

  if (base.loading && !base.data) return <SkeletonCard height={320} />;
  if (base.error && !base.data) return <ErrorState message={base.error.message} onRetry={base.reload} />;
  if (!base.data) return null;

  const { empresa } = base.data;

  return (
    <View style={styles.screen}>
      <GradientHeader variant="detail" title="Empresa" onBack={() => navigation.goBack()}>
        <Text style={[typography.cardTitle, { color: colors.onDark }]} numberOfLines={2}>
          {formatNombre(empresa.razonSocial)}
        </Text>
        <Text style={[typography.mono, { color: colors.accent }]}>{formatRut(empresa.rut)}</Text>
        {participacionActiva?.perfilNombre && (
          <View style={styles.perfilPill}>
            <Text style={[typography.caption, { color: colors.onDark }]}>
              {participacionActiva.perfilNombre}
            </Text>
          </View>
        )}
      </GradientHeader>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={<RefreshControl refreshing={base.refreshing} onRefresh={base.refresh} />}
      >
        {participacionesActivas.length === 0 && (
          <EmptyState title="Sin participaciones" message="Esta empresa no tiene participaciones activas." />
        )}

        {participacionesActivas.length > 0 && (
          <>
            {participacionesActivas.length > 1 && (
              <View style={styles.selector}>
                {participacionesActivas.map((p) => (
                  <TouchableOpacity
                    key={p.proyectoId}
                    onPress={() => setProyectoIdSeleccionado(p.proyectoId)}
                    style={[styles.chip, p.proyectoId === participacionActiva?.proyectoId && styles.chipActivo]}
                  >
                    <Text style={{ color: p.proyectoId === participacionActiva?.proyectoId ? colors.onDark : colors.ink }}>
                      {p.proyectoNombre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <SectionCard title="Cumplimiento">
              <ProgressRow
                pct={participacionActiva.evaluacion?.avancePct}
                ratio={{ num: avance.cumple, den: participacionActiva.evaluacion?.evaluados || 0 }}
              />
              <View style={styles.mt}>
                <ResultCounters cumple={avance.cumple} noCumple={avance.noCumple} pendiente={avance.pendiente} />
              </View>
              {participacionActiva.evaluacion?.expedienteEstado && (
                <View style={styles.mt}>
                  <StatusPill estado={estadoExpediente(participacionActiva.evaluacion.expedienteEstado)} />
                </View>
              )}
              {participacionRaw && (
                <View style={styles.mt}>
                  <InfoGrid
                    items={[
                      { label: "Inicio de contrato", value: participacionRaw.fechaInicio ?
                        new Date(participacionRaw.fechaInicio).toLocaleDateString("es-CL") : "—" },
                      { label: "Fin de contrato", value: participacionRaw.fechaTermino ?
                        new Date(participacionRaw.fechaTermino).toLocaleDateString("es-CL") : "—" },
                      ...(empresa.contacto?.nombre ?
                        [{ label: "Contacto", value: empresa.contacto.nombre }] : []),
                    ]}
                  />
                </View>
              )}
            </SectionCard>

            <SectionCard title="Recursos asignados">
              <View style={styles.grid}>
                {contadoresRol.map((tile) => (
                  <TouchableOpacity
                    key={tile.key}
                    style={[styles.tile, filtroRol === tile.key && styles.tileActivo]}
                    onPress={() => setFiltroRol(filtroRol === tile.key ? null : tile.key)}
                  >
                    <Text style={[typography.cardTitle, { color: filtroRol === tile.key ? colors.onDark : colors.ink }]}>
                      {tile.count}
                    </Text>
                    <Text style={[typography.caption, { color: filtroRol === tile.key ? colors.onDark : colors.muted }]}>
                      {tile.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {asignacionesFiltradas.length === 0 ? (
                <EmptyState message="Sin personas ni máquinas asignadas en este proyecto." />
              ) : (
                asignacionesFiltradas.map((a) => (
                  <ListRow
                    key={a.id}
                    entity={a.personaId ? "personas" : "maquinas"}
                    titulo={a.personaId ?
                      formatNombre(nombresPersonas.data?.[a.personaId] ?
                        `${nombresPersonas.data[a.personaId].nombre} ${nombresPersonas.data[a.personaId].apellido}` :
                        a.personaId) :
                      a.recursoId}
                    subtituloMono={a.rol}
                    onPress={() => navigation.navigate(
                        a.personaId ? "DetallePersona" : "DetalleMaquinaria",
                        a.personaId ? { personaId: a.personaId } : { recursoId: a.recursoId },
                    )}
                  />
                ))
              )}
            </SectionCard>

            <SectionCard title="Requerimientos de empresa">
              {filasRequerimientos.length === 0 ? (
                <EmptyState message="Este perfil no tiene requerimientos de empresa." />
              ) : (
                filasRequerimientos.map(({ requerimiento, evaluacion }, i) => (
                  <ReqRow
                    key={requerimiento.requerimientoId}
                    numero={i + 1}
                    nombre={requerimiento.nombre}
                    evaluacion={evaluacion}
                  />
                ))
              )}
            </SectionCard>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  perfilPill: {
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, alignSelf: "flex-start",
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
  mt: { marginTop: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  tile: {
    flexBasis: "47%", backgroundColor: entityColors.empresas.bg,
    borderRadius: radius.card, padding: spacing.md, alignItems: "center",
  },
  tileActivo: { backgroundColor: colors.primary },
});
