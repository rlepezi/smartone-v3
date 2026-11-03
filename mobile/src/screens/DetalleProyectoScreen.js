import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useMandante } from "../contexts/MandanteContext";
import { useAsync } from "../hooks/useAsync";
import { proyectoService } from "../services/proyectoService";
import { colors, entityColors } from "../theme/colors";
import { entityIcons } from "../theme/entityIcons";
import { estadoNivel, estadoProyecto } from "../theme/status";
import { spacing, radius } from "../theme/spacing";
import { typography, MAX_FONT_SCALE } from "../theme/typography";
import { ScreenHeader } from "../components/ScreenHeader";
import { ScreenBody } from "../components/ScreenBody";
import { Card } from "../components/Card";
import { DataGrid } from "../components/DataGrid";
import { ComplianceSummary } from "../components/ComplianceSummary";
import { StatusBadge } from "../components/StatusBadge";
import { SegmentBar } from "../components/SegmentBar";
import { ListCard } from "../components/ListCard";
import { EntityAvatar } from "../components/EntityAvatar";
import { EmptyState } from "../components/EmptyState";
import { formatDate } from "../utils/fechas";
import { formatRut } from "../utils/formatRut";
import { getMandanteDisplayName } from "../utils/mandanteDisplay";
import { textoPorcentaje } from "../utils/complianceStatus";
import { plural } from "../utils/texto";
import { tokenReset } from "../utils/navegacion";

export default function DetalleProyectoScreen({ route, navigation }) {
  const { proyectoId } = route.params;
  const { mandanteId, mandantes, umbralesDe } = useMandante();

  const estado = useAsync(
    ({ forzar } = {}) => proyectoService.obtenerDetalle(proyectoId, { mandanteId, umbralesDe, forzar }),
    [proyectoId, mandanteId],
  );
  const data = estado.data;

  // Empresas participantes con el cumplimiento de su Expediente (contadores del backend) y el
  // perfil de participación (reporte de participantes).
  const empresas = useMemo(() => {
    if (!data) return [];
    const participantes = Object.fromEntries(data.participantes.map((p) => [p.empresaId, p]));
    return data.indice.expedientesDeProyecto(proyectoId).map((e) => ({
      expediente: e,
      nivel: data.indice.nivelExpediente(e),
      participante: participantes[e.empresaId] || {},
    })).sort((a, b) => (a.nivel.pct ?? 101) - (b.nivel.pct ?? 101));
  }, [data, proyectoId]);

  const proyecto = data?.proyecto;
  const agregado = data?.indice.proyecto(proyectoId) || null;
  const mandante = mandantes.find((m) => m.id === proyecto?.mandanteId);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        variant="detalle"
        onBack={() => navigation.goBack()}
        label="Proyecto"
        title={proyecto?.nombre || "Proyecto"}
        meta={[proyecto?.codigo, getMandanteDisplayName(mandante)].filter(Boolean).join(" · ") || null}
      >
        {proyecto ? <StatusBadge estado={estadoProyecto(proyecto.estado)} /> : null}
      </ScreenHeader>
      <ScreenBody estado={estado}>
        {proyecto ? (
          <>
            <Card>
              <DataGrid items={[
                { label: "Inicio", value: formatDate(proyecto.fechaInicio) },
                { label: "Término plan.", value: formatDate(proyecto.fechaTermino) },
                { label: "Término real", value: formatDate(proyecto.fechaTerminoReal) },
              ]} />
            </Card>

            <Card>
              {agregado ? <ComplianceSummary nivel={agregado} titulo="Cumplimiento del proyecto" /> : (
                <EmptyState title="Sin expedientes" message="Este proyecto no tiene empresas con expediente abierto." />
              )}
            </Card>

            <View style={styles.conteos}>
              <Conteo entidad="empresas" n={agregado?.empresas || 0} singular="Empresa"
                onPress={() => navigation.navigate("Empresas", { screen: "ListaEmpresas", params: { reset: tokenReset() } })} />
              <Conteo entidad="personas" n={agregado?.personas || 0} singular="Persona"
                onPress={() => navigation.navigate("Personas", { screen: "ListaPersonas", params: { reset: tokenReset() } })} />
              <Conteo entidad="equipos" n={agregado?.equipos || 0} singular="Equipo"
                onPress={() => navigation.navigate("Equipos", { screen: "ListaEquipos", params: { reset: tokenReset() } })} />
            </View>

            <Card title="Empresas participantes">
              {empresas.length === 0 ? <EmptyState message="Sin empresas participantes." /> : null}
              {empresas.map(({ expediente, nivel, participante }) => {
                const e = estadoNivel(nivel.clave);
                return (
                  <ListCard key={expediente.id} style={styles.empresa}
                    onPress={() => navigation.navigate("DetalleEmpresa", { empresaId: expediente.empresaId, proyectoId })}>
                    <EntityAvatar tipo="empresa" nombre={participante.empresaNombre} size={36} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[typography.bodyBold, { color: colors.text }]} numberOfLines={2}>{participante.empresaNombre || "Empresa"}</Text>
                      <Text style={[typography.caption, { color: colors.textSubtle }]} numberOfLines={1}>
                        {[participante.rut ? formatRut(participante.rut) : null, participante.perfilParticipacion].filter(Boolean).join(" · ")}
                      </Text>
                      <View style={styles.barra}>
                        <View style={{ flex: 1 }}>
                          <SegmentBar segments={[
                            { value: nivel.aprobados, color: e.dot },
                            { value: Math.max(nivel.aplicables - nivel.aprobados, 0), color: colors.border },
                          ]} />
                        </View>
                        <Text style={[typography.bodyBold, { color: e.fg }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{textoPorcentaje(nivel.pct)}</Text>
                      </View>
                      <View style={styles.pie}>
                        <StatusBadge estado={e} />
                        <Text style={[typography.caption, { color: colors.textSubtle }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                          {nivel.aprobados}/{plural(nivel.aplicables, "requerimiento")}
                        </Text>
                      </View>
                    </View>
                    <ChevronRight color={colors.textSubtle} size={18} />
                  </ListCard>
                );
              })}
            </Card>
          </>
        ) : null}
      </ScreenBody>
    </View>
  );

}

function Conteo({ entidad, n, singular, onPress }) {
  const Icono = entityIcons[entidad];
  const tono = entityColors[entidad];
  return (
    <TouchableOpacity style={styles.conteo} onPress={onPress} accessibilityLabel={`${n} ${singular}`}>
      <View style={[styles.conteoIcono, { backgroundColor: tono.bg }]}><Icono color={tono.color} size={16} /></View>
      <Text style={[typography.cardTitle, { color: colors.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{n}</Text>
      <Text style={[typography.label, { color: colors.textMuted }]} maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}>
        {n === 1 ? singular : `${singular}s`}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  conteos: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  conteo: {
    flex: 1, minHeight: 80, alignItems: "center", justifyContent: "center", gap: 2, padding: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border,
  },
  conteoIcono: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  empresa: { marginBottom: 0, backgroundColor: colors.bg, borderWidth: 0, alignItems: "flex-start" },
  barra: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pie: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
});
