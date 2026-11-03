import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { ChevronRight, History } from "lucide-react-native";
import { useMandante } from "../contexts/MandanteContext";
import { useAsync } from "../hooks/useAsync";
import { personaService } from "../services/personaService";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";
import { ScreenHeader } from "../components/ScreenHeader";
import { ScreenBody } from "../components/ScreenBody";
import { Card } from "../components/Card";
import { DataGrid } from "../components/DataGrid";
import { TabsParticipacion } from "../components/TabsParticipacion";
import { ComplianceSummary } from "../components/ComplianceSummary";
import { RequerimientosLista } from "../components/RequerimientosLista";
import { EntityAvatar } from "../components/EntityAvatar";
import { EmptyState } from "../components/EmptyState";
import { formatDate } from "../utils/fechas";
import { formatRut } from "../utils/formatRut";
import { formatNombre } from "../utils/formatNombre";
import { nivelDeResumen, resumenDeSujeto } from "../utils/complianceStatus";

export default function DetallePersonaScreen({ route, navigation }) {
  const { personaId } = route.params;
  const { mandanteId, umbralesDe } = useMandante();
  const [tab, setTab] = useState(null);
  const [verHistorial, setVerHistorial] = useState(false);

  const base = useAsync(
    ({ forzar } = {}) => personaService.obtenerDetalle(personaId, { mandanteId, umbralesDe, forzar }),
    [personaId, mandanteId],
  );
  const data = base.data;
  const participaciones = data?.participacionesActivas || [];
  const activa = participaciones.find((p) => p.participacionId === tab) || participaciones[0] || null;
  const expediente = activa ? data.indice.expedienteDe(activa.empresaId, activa.proyectoId) : null;

  const filas = useAsync(
    async () => (expediente ? personaService.filas(expediente.id, personaId) : []),
    [expediente?.id, personaId],
  );

  const persona = data?.persona;
  const nombre = persona ? formatNombre(`${persona.nombre || ""} ${persona.apellido || ""}`) : "Persona";
  const empresaActual = persona?.empresaActual;
  // Historial: relaciones con empresas que ya terminaron (la vigente es la "Empresa actual").
  const anteriores = (data?.relaciones || []).filter((r) => r.estado !== "activa");

  return (
    <View style={styles.screen}>
      <ScreenHeader
        variant="detalle"
        onBack={() => navigation.goBack()}
        label="Persona"
        left={persona ? (
          <View style={styles.cabecera}>
            <EntityAvatar tipo="persona" nombre={nombre} size={48} oscuro />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.label, styles.label]}>PERSONA</Text>
              <Text style={[typography.headerTitle, { color: colors.onDark }]} numberOfLines={2}>{nombre}</Text>
              <Text style={[typography.mono, { color: colors.onDarkMuted }]}>{formatRut(persona.rut)}</Text>
            </View>
          </View>
        ) : null}
        title={persona ? null : "Persona"}
      />
      <ScreenBody estado={base}>
        {persona ? (
          <>
            <Card title="Empresa actual">
              {empresaActual ? (
                <TouchableOpacity style={styles.empresa} onPress={() => navigation.navigate("DetalleEmpresa", { empresaId: empresaActual.empresaId })}>
                  <EntityAvatar tipo="empresa" nombre={empresaActual.empresaNombre} size={40} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[typography.bodyBold, { color: colors.text }]} numberOfLines={2}>{empresaActual.empresaNombre || "Empresa"}</Text>
                    <Text style={[typography.caption, { color: colors.textSubtle }]}>
                      {[empresaActual.cargo, empresaActual.tipoRelacion].filter(Boolean).join(" · ") || "Sin cargo"}
                    </Text>
                    <Text style={[typography.caption, { color: colors.textSubtle }]}>Desde {formatDate(empresaActual.fechaInicio)}</Text>
                  </View>
                  <ChevronRight color={colors.textSubtle} size={18} />
                </TouchableOpacity>
              ) : <EmptyState title="Sin empresa" message="Esta persona no tiene una relación vigente con una empresa visible." />}
              {anteriores.length > 0 ? (
                <TouchableOpacity style={styles.historial} onPress={() => setVerHistorial((v) => !v)}>
                  <History color={colors.primary} size={16} />
                  <Text style={[typography.bodyBold, { color: colors.primary }]}>
                    {verHistorial ? "Ocultar historial de empresas" : "Historial de empresas"}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {verHistorial ? anteriores.map((r) => (
                <View key={r.id} style={styles.relacion}>
                  <Text style={[typography.bodyBold, { color: colors.text }]} numberOfLines={2}>{r.empresaNombre || "Empresa"}</Text>
                  <Text style={[typography.caption, { color: colors.textSubtle }]}>
                    {[r.cargo, `${formatDate(r.fechaInicio)} – ${formatDate(r.fechaTermino)}`].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              )) : null}
            </Card>

            <TabsParticipacion
              items={participaciones.map((p) => ({ key: p.participacionId, label: p.proyectoNombre || "Proyecto" }))}
              value={activa?.participacionId}
              onChange={setTab}
            />

            {activa ? (
              <>
                <Card>
                  <DataGrid items={[
                    { label: "Rol", value: (activa.perfilesRecurso || []).map((p) => p.nombre).join(", ") || "Sin perfil" },
                    { label: "Mandante", value: activa.mandanteNombre },
                  ]} />
                  {expediente ? (
                    <ComplianceSummary nivel={nivelDeResumen(resumenDeSujeto(expediente, { personaId }), umbralesDe(expediente.mandanteId))} />
                  ) : <EmptyState title="Sin expediente" message="La participación aún no tiene expediente abierto." />}
                </Card>
                <RequerimientosLista
                  key={`q-${activa.participacionId}`}
                  titulo="Requerimientos de la persona"
                  filas={filas.data}
                  cargando={filas.loading}
                  vacio="Su perfil no tiene requerimientos de persona en este proyecto."
                />
              </>
            ) : (
              <Card>
                <EmptyState title="Sin participaciones activas" message="Esta persona no está asignada hoy a proyectos de este mandante." />
              </Card>
            )}
          </>
        ) : null}
      </ScreenBody>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  cabecera: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  label: { color: colors.onDarkMuted, letterSpacing: 0.6 },
  empresa: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 44 },
  historial: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 44 },
  relacion: { gap: 2, paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
});
