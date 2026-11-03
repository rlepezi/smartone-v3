import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useMandante } from "../contexts/MandanteContext";
import { useAsync } from "../hooks/useAsync";
import { useListPaging } from "../hooks/useListPaging";
import { proyectoService } from "../services/proyectoService";
import { colors } from "../theme/colors";
import { entityIcons } from "../theme/entityIcons";
import { estadoNivel, estadoProyecto, ESTADO_PROYECTO } from "../theme/status";
import { spacing } from "../theme/spacing";
import { typography, MAX_FONT_SCALE } from "../theme/typography";
import { ScreenHeader } from "../components/ScreenHeader";
import { ScreenBody } from "../components/ScreenBody";
import { useNombreMandante } from "../components/MandanteSelector";
import { SearchBar } from "../components/SearchBar";
import { FilterChips } from "../components/FilterChips";
import { ListCard } from "../components/ListCard";
import { StatusBadge } from "../components/StatusBadge";
import { SegmentBar } from "../components/SegmentBar";
import { EmptyState } from "../components/EmptyState";
import { VerMas } from "../components/VerMas";
import { textoPorcentaje } from "../utils/complianceStatus";
import { coincide, plural } from "../utils/texto";
import { masRecientesPrimero } from "../utils/orden";

export default function ListaProyectosScreen({ route, navigation }) {
  const { mandanteId, umbralesDe } = useMandante();
  const nombreMandante = useNombreMandante();
  const [busqueda, setBusqueda] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState(null);

  // Abierta desde un acceso (Inicio, detalle de proyecto): filtros en "Todos" y sin búsqueda.
  const [paramsPrevios, setParamsPrevios] = useState(route.params);
  if (route.params !== paramsPrevios) {
    setParamsPrevios(route.params);
    if (route.params?.reset) {
      setBusqueda("");
      setEstadoFiltro(null);
    }
  }

  const estado = useAsync(
    ({ forzar } = {}) => proyectoService.listar({ mandanteId, umbralesDe, forzar }),
    [mandanteId],
  );

  const proyectos = useMemo(() => {
    const lista = estado.data?.proyectos || [];
    return [...lista].sort(masRecientesPrimero).map((p) => ({ ...p, cumplimiento: estado.data.indice.proyecto(p.id) }));
  }, [estado.data]);

  const buscados = useMemo(() => proyectos.filter((p) => coincide(busqueda, p.nombre, p.codigo)), [proyectos, busqueda]);
  const filtrados = useMemo(() => buscados.filter((p) => !estadoFiltro || p.estado === estadoFiltro), [buscados, estadoFiltro]);
  const { visibles, hayMas, cargarMas } = useListPaging(filtrados);

  const opciones = [
    { value: null, label: "Todos", count: buscados.length },
    ...Object.entries(ESTADO_PROYECTO).map(([value, e]) => ({
      value, label: e.label, count: buscados.filter((p) => p.estado === value).length,
    })),
  ];

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Proyectos" subtitle={nombreMandante} count={estado.data ? filtrados.length : null} />
      <ScreenBody estado={estado}>
        <SearchBar value={busqueda} onChangeText={setBusqueda} placeholder="Buscar por nombre o código" />
        <FilterChips options={opciones} value={estadoFiltro} onChange={setEstadoFiltro} />
        {filtrados.length === 0 ? <EmptyState message="No hay proyectos que coincidan con el filtro." /> : null}
        {visibles.map((p) => <TarjetaProyecto key={p.id} proyecto={p}
          onPress={() => navigation.navigate("DetalleProyecto", { proyectoId: p.id })} />)}
        <VerMas visible={hayMas} onPress={cargarMas} />
      </ScreenBody>
    </View>
  );
}

function TarjetaProyecto({ proyecto, onPress }) {
  const c = proyecto.cumplimiento;
  const nivel = estadoNivel(c?.clave || "sinRequerimientos");
  return (
    <ListCard onPress={onPress} style={styles.card} accessibilityLabel={proyecto.nombre}>
      <View style={styles.cabecera}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.bodyBold, { color: colors.text }]} numberOfLines={2}>{proyecto.nombre}</Text>
          {proyecto.codigo ? <Text style={[typography.mono, { color: colors.textSubtle }]}>{proyecto.codigo}</Text> : null}
        </View>
        <StatusBadge estado={estadoProyecto(proyecto.estado)} />
      </View>
      <View style={styles.cumplimiento}>
        <View style={{ flex: 1 }}>
          <SegmentBar segments={[
            { value: c?.aprobados || 0, color: nivel.dot },
            { value: Math.max((c?.aplicables || 0) - (c?.aprobados || 0), 0), color: colors.border },
          ]} />
        </View>
        <Text style={[typography.bodyBold, { color: nivel.fg }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{textoPorcentaje(c?.pct)}</Text>
        <Text style={[typography.caption, { color: colors.textSubtle }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {c ? `${c.aprobados}/${c.aplicables}` : "0/0"}
        </Text>
      </View>
      <View style={styles.conteos}>
        <Conteo icono={entityIcons.empresas} texto={plural(c?.empresas || 0, "empresa")} />
        <Conteo icono={entityIcons.personas} texto={plural(c?.personas || 0, "persona")} />
        <Conteo icono={entityIcons.equipos} texto={plural(c?.equipos || 0, "equipo")} />
      </View>
    </ListCard>
  );
}

function Conteo({ icono: Icono, texto }) {
  return (
    <View style={styles.conteo}>
      <Icono color={colors.textSubtle} size={14} />
      <Text style={[typography.caption, { color: colors.textMuted }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { flexDirection: "column", alignItems: "stretch", gap: spacing.sm },
  cabecera: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cumplimiento: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  conteos: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  conteo: { flexDirection: "row", alignItems: "center", gap: 4 },
});
