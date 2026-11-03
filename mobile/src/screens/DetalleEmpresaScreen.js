import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useAuth } from "../contexts/AuthContext";
import { useMandante } from "../contexts/MandanteContext";
import { can } from "../permissions/can";
import { useAsync } from "../hooks/useAsync";
import { empresaService } from "../services/empresaService";
import { colors } from "../theme/colors";
import { estadoNivel } from "../theme/status";
import { spacing, radius } from "../theme/spacing";
import { typography, MAX_FONT_SCALE } from "../theme/typography";
import { ScreenHeader } from "../components/ScreenHeader";
import { ScreenBody } from "../components/ScreenBody";
import { Card } from "../components/Card";
import { DataGrid } from "../components/DataGrid";
import { TabsParticipacion } from "../components/TabsParticipacion";
import { ComplianceSummary } from "../components/ComplianceSummary";
import { RequerimientosLista } from "../components/RequerimientosLista";
import { StatusBadge } from "../components/StatusBadge";
import { ListCard } from "../components/ListCard";
import { EntityAvatar } from "../components/EntityAvatar";
import { EmptyState } from "../components/EmptyState";
import { formatDate } from "../utils/fechas";
import { formatRut } from "../utils/formatRut";
import { formatNombre } from "../utils/formatNombre";
import { nivelDeResumen, resumenDeSujeto } from "../utils/complianceStatus";
import { nombreEquipo } from "../utils/identificacionEquipo";
import { plural } from "../utils/texto";

export default function DetalleEmpresaScreen({ route, navigation }) {
  const { empresaId, proyectoId: proyectoInicial } = route.params;
  const { rol } = useAuth();
  const conCumplimiento = can(rol, "ver_operacion");
  const { mandanteId, umbralesDe } = useMandante();

  const base = useAsync(
    ({ forzar } = {}) => empresaService.obtenerDetalle(empresaId, { mandanteId, umbralesDe, forzar, conCumplimiento }),
    [empresaId, mandanteId, conCumplimiento],
  );
  const participaciones = base.data?.participacionesActivas || [];
  const [tab, setTab] = useState(null);
  const activa = participaciones.find((p) => p.participacionId === tab) ||
    participaciones.find((p) => p.proyectoId === proyectoInicial) || participaciones[0] || null;
  const expediente = activa ? base.data.indice?.expedienteDe(empresaId, activa.proyectoId) : null;
  const umbrales = umbralesDe(expediente?.mandanteId);

  const detalle = useAsync(async () => (activa ? empresaService.obtenerDetalleParticipacion({
    expediente, participacionId: activa.participacionId, mandanteId: activa.mandanteId,
  }) : null), [activa?.participacionId, expediente?.id]);

  const empresa = base.data?.empresa;
  const proyectosN = participaciones.length;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        variant="detalle"
        onBack={() => navigation.goBack()}
        label="Empresa"
        title={empresa?.razonSocial || "Empresa"}
        subtitle={empresa?.nombreFantasia && empresa.nombreFantasia !== empresa.razonSocial ? empresa.nombreFantasia : null}
        meta={empresa ? `${formatRut(empresa.rut)}${conCumplimiento ? ` · ${plural(proyectosN, "proyecto")}` : ""}` : null}
      />
      <ScreenBody estado={base}>
        {empresa ? (
          <>
            {conCumplimiento && participaciones.length > 0 ? (
              <TabsParticipacion
                items={participaciones.map((p) => ({ key: p.participacionId, label: p.proyectoCodigo || p.proyectoNombre || "Proyecto" }))}
                value={activa?.participacionId}
                onChange={setTab}
              />
            ) : null}

            {conCumplimiento && activa ? (
              <>
                <Card>
                  <Text style={[typography.bodyBold, { color: colors.text }]} numberOfLines={2}>{activa.proyectoNombre || "Proyecto"}</Text>
                  {expediente ? <ComplianceSummary nivel={nivelDeResumen(expediente.resumen, umbrales)} /> : (
                    <EmptyState title="Sin expediente" message="Esta participación aún no tiene expediente abierto." />
                  )}
                  <DataGrid items={[
                    { label: "Perfil de participación", value: activa.perfilNombre },
                    { label: "Mandante", value: activa.mandanteNombre },
                    { label: "Inicio de contrato", value: formatDate(activa.fechaInicio) },
                    { label: "Fin de contrato", value: formatDate(activa.fechaTermino) },
                  ]} />
                </Card>

                <RecursosParticipacion
                  key={`r-${activa.participacionId}`}
                  detalle={detalle}
                  expediente={expediente}
                  umbrales={umbrales}
                  onAbrir={(s) => navigation.navigate(s.personaId ? "DetallePersona" : "DetalleEquipo",
                    s.personaId ? { personaId: s.personaId } : { recursoId: s.recursoId })}
                />

                <RequerimientosLista
                  key={`q-${activa.participacionId}`}
                  titulo="Requerimientos de empresa"
                  filas={detalle.data?.filasEmpresa || (detalle.loading ? null : [])}
                  cargando={detalle.loading}
                  vacio="Este perfil no tiene requerimientos de empresa."
                />
              </>
            ) : null}

            {conCumplimiento && participaciones.length === 0 ? (
              <Card>
                <EmptyState title="Sin participaciones activas" message="Esta empresa no participa hoy en proyectos de este mandante." />
              </Card>
            ) : null}

            <Card title="Datos de la empresa">
              <DataGrid items={[
                { label: "RUT", value: formatRut(empresa.rut) },
                { label: "Giro", value: empresa.giro },
                { label: "Contacto", value: empresa.contacto?.nombre },
                { label: "Teléfono", value: empresa.contacto?.telefono },
              ]} />
            </Card>
          </>
        ) : null}
      </ScreenBody>
    </View>
  );
}

// Personas y Equipos de la participación: conteo por perfil de recurso (rol) más Equipos, y la
// lista (filtrable tocando un conteo) con el nivel de cada uno en ESTE expediente.
function RecursosParticipacion({ detalle, expediente, umbrales, onAbrir }) {
  const [filtro, setFiltro] = useState(null);
  const sujetos = useMemo(() => detalle.data?.sujetos || [], [detalle.data]);
  const perfilesPorId = useMemo(() => detalle.data?.perfilesPorId || {}, [detalle.data]);
  const fichas = detalle.data?.fichas || {};

  const tiles = useMemo(() => {
    const porPerfil = {};
    let equipos = 0;
    sujetos.forEach((s) => {
      if (s.recursoId) { equipos += 1; return; }
      (s.perfilRecursoIds.length ? s.perfilRecursoIds : ["sin-perfil"]).forEach((id) => { porPerfil[id] = (porPerfil[id] || 0) + 1; });
    });
    return [
      ...Object.entries(porPerfil).map(([id, n]) => ({ key: id, label: perfilesPorId[id]?.nombre || "Sin perfil", n })),
      { key: "equipos", label: "Equipos", n: equipos },
    ];
  }, [sujetos, perfilesPorId]);

  const visibles = sujetos.filter((s) => !filtro || (filtro === "equipos" ? s.recursoId : s.perfilRecursoIds.includes(filtro)));

  return (
    <Card title="Recursos en este proyecto">
      {detalle.loading && !detalle.data ? <EmptyState title="Cargando recursos..." /> : null}
      {detalle.data ? (
        <>
          <View style={styles.tiles}>
            {tiles.map((t) => {
              const activo = filtro === t.key;
              return (
                <TouchableOpacity key={t.key} style={[styles.tile, activo && styles.tileActivo]}
                  onPress={() => setFiltro(activo ? null : t.key)} accessibilityState={{ selected: activo }}>
                  <Text style={[typography.cardTitle, { color: activo ? colors.onDark : colors.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t.n}</Text>
                  <Text style={[typography.label, { color: activo ? colors.onDark : colors.textMuted }]} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {visibles.length === 0 ? <EmptyState message="Sin personas ni equipos asignados en este proyecto." /> : null}
          {visibles.map((s) => {
            const ficha = fichas[s.personaId || s.recursoId];
            const nombre = s.personaId ? formatNombre(ficha ? `${ficha.nombre} ${ficha.apellido}` : "Persona") : nombreEquipo(ficha);
            const nivel = nivelDeResumen(resumenDeSujeto(expediente, s), umbrales);
            return (
              <ListCard key={s.id} style={styles.sujeto} onPress={() => onAbrir(s)} accessibilityLabel={nombre}>
                <EntityAvatar tipo={s.personaId ? "persona" : "equipo"} nombre={nombre} tipoEquipo={ficha?.tipo} size={36} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[typography.bodyBold, { color: colors.text }]} numberOfLines={2}>{nombre}</Text>
                  <Text style={[typography.caption, { color: colors.textSubtle }]} numberOfLines={1}>
                    {s.perfilRecursoIds.map((id) => perfilesPorId[id]?.nombre).filter(Boolean).join(", ") || (s.recursoId ? ficha?.tipo : "Sin perfil")}
                  </Text>
                  <StatusBadge estado={estadoNivel(nivel.clave)} />
                </View>
                <ChevronRight color={colors.textSubtle} size={18} />
              </ListCard>
            );
          })}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: {
    flexGrow: 1, flexBasis: "45%", minHeight: 64, borderRadius: radius.button, padding: spacing.sm,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.bg,
  },
  tileActivo: { backgroundColor: colors.primary },
  sujeto: { marginBottom: 0, backgroundColor: colors.bg, borderWidth: 0 },
});
