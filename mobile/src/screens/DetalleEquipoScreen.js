import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useMandante } from "../contexts/MandanteContext";
import { useAsync } from "../hooks/useAsync";
import { recursoService } from "../services/recursoService";
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
import { EquipoIdentificador } from "../components/PlateBadge";
import { EmptyState } from "../components/EmptyState";
import { formatDate } from "../utils/fechas";
import { nivelDeResumen, resumenDeSujeto } from "../utils/complianceStatus";
import { nombreEquipo } from "../utils/identificacionEquipo";

export default function DetalleEquipoScreen({ route, navigation }) {
  const { recursoId } = route.params;
  const { mandanteId, umbralesDe } = useMandante();
  const [tab, setTab] = useState(null);

  const base = useAsync(
    ({ forzar } = {}) => recursoService.obtenerDetalle(recursoId, { mandanteId, umbralesDe, forzar }),
    [recursoId, mandanteId],
  );
  const data = base.data;
  const participaciones = data?.participacionesActivas || [];
  const activa = participaciones.find((p) => p.participacionId === tab) || participaciones[0] || null;
  const expediente = activa ? data.indice.expedienteDe(activa.empresaId, activa.proyectoId) : null;

  const filas = useAsync(
    async () => (expediente ? recursoService.filas(expediente.id, recursoId) : []),
    [expediente?.id, recursoId],
  );

  const recurso = data?.recurso;
  const empresaActual = recurso?.empresaActual;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        variant="detalle"
        onBack={() => navigation.goBack()}
        left={recurso ? (
          <View style={styles.cabecera}>
            <EntityAvatar tipo="equipo" tipoEquipo={recurso.tipo} size={48} oscuro />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.label, styles.label]}>EQUIPO</Text>
              <Text style={[typography.headerTitle, { color: colors.onDark }]} numberOfLines={2}>{nombreEquipo(recurso)}</Text>
              <Text style={[typography.caption, { color: colors.onDarkMuted }]}>
                {[recurso.tipo, recurso.anio].filter(Boolean).join(" · ") || "Sin tipo"}
              </Text>
            </View>
          </View>
        ) : null}
        title={recurso ? null : "Equipo"}
      >
        {recurso ? <EquipoIdentificador recurso={recurso} /> : null}
      </ScreenHeader>
      <ScreenBody estado={base}>
        {recurso ? (
          <>
            <Card title="Empresa actual">
              {empresaActual ? (
                <TouchableOpacity style={styles.empresa} onPress={() => navigation.navigate("DetalleEmpresa", { empresaId: empresaActual.empresaId })}>
                  <EntityAvatar tipo="empresa" nombre={empresaActual.empresaNombre} size={40} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[typography.bodyBold, { color: colors.text }]} numberOfLines={2}>{empresaActual.empresaNombre || "Empresa"}</Text>
                    {empresaActual.fechaInicio ? (
                      <Text style={[typography.caption, { color: colors.textSubtle }]}>Desde {formatDate(empresaActual.fechaInicio)}</Text>
                    ) : null}
                  </View>
                  <ChevronRight color={colors.textSubtle} size={18} />
                </TouchableOpacity>
              ) : <EmptyState title="Sin empresa" message="Este equipo no tiene una relación vigente con una empresa visible." />}
            </Card>

            <TabsParticipacion
              items={participaciones.map((p) => ({ key: p.participacionId, label: p.proyectoCodigo || p.proyectoNombre || "Proyecto" }))}
              value={activa?.participacionId}
              onChange={setTab}
            />

            {activa ? (
              <>
                <Card>
                  <Text style={[typography.bodyBold, { color: colors.text }]} numberOfLines={2}>{activa.proyectoNombre || "Proyecto"}</Text>
                  <DataGrid items={[{ label: "Perfil", value: activa.perfiles.join(", ") || "Sin perfil" }]} />
                  {expediente ? (
                    <ComplianceSummary nivel={nivelDeResumen(resumenDeSujeto(expediente, { recursoId }), umbralesDe(expediente.mandanteId))} />
                  ) : <EmptyState title="Sin expediente" message="La participación aún no tiene expediente abierto." />}
                </Card>
                <RequerimientosLista
                  key={`q-${activa.participacionId}`}
                  titulo="Requerimientos del equipo"
                  filas={filas.data}
                  cargando={filas.loading}
                  vacio="Su perfil no tiene requerimientos de equipo en este proyecto."
                />
              </>
            ) : (
              <Card>
                <EmptyState title="Sin participaciones activas" message="Este equipo no está asignado hoy a proyectos de este mandante." />
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
});
