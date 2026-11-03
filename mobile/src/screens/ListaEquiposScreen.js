import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useMandante } from "../contexts/MandanteContext";
import { useAsync } from "../hooks/useAsync";
import { useListPaging } from "../hooks/useListPaging";
import { recursoService } from "../services/recursoService";
import { colors } from "../theme/colors";
import { estadoNivel } from "../theme/status";
import { typography } from "../theme/typography";
import { ScreenHeader } from "../components/ScreenHeader";
import { ScreenBody } from "../components/ScreenBody";
import { useNombreMandante } from "../components/MandanteSelector";
import { SearchBar } from "../components/SearchBar";
import { FilterChips } from "../components/FilterChips";
import { ListCard } from "../components/ListCard";
import { StatusBadge } from "../components/StatusBadge";
import { EntityAvatar } from "../components/EntityAvatar";
import { EquipoIdentificador } from "../components/PlateBadge";
import { EmptyState } from "../components/EmptyState";
import { VerMas } from "../components/VerMas";
import { coincide } from "../utils/texto";
import { nombreEquipo } from "../utils/identificacionEquipo";

// Tipo de equipo para mostrar y agrupar: el texto libre de la Maquinaria, con la primera letra en
// mayúscula ("TRACTOR" y "Tractor" son el mismo chip).
const tipoVisible = (tipo) => {
  const t = String(tipo || "").trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Sin tipo";
};

export default function ListaEquiposScreen({ route, navigation }) {
  const { mandanteId, umbralesDe } = useMandante();
  const nombreMandante = useNombreMandante();
  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState(null);

  // Abierta desde un acceso (Inicio, detalle de proyecto): filtros en "Todos" y sin búsqueda.
  const [paramsPrevios, setParamsPrevios] = useState(route.params);
  if (route.params !== paramsPrevios) {
    setParamsPrevios(route.params);
    if (route.params?.reset) {
      setBusqueda("");
      setTipo(null);
    }
  }

  const estado = useAsync(
    ({ forzar } = {}) => recursoService.listar({ mandanteId, umbralesDe, forzar }),
    [mandanteId],
  );

  const equipos = useMemo(() => (estado.data?.recursos || []).map((r) => ({
    ...r,
    titulo: nombreEquipo(r),
    tipoTxt: tipoVisible(r.tipo),
    nivel: estado.data.indice.recurso(r.id),
  })).sort((a, b) => a.titulo.localeCompare(b.titulo, "es")), [estado.data]);

  const buscados = useMemo(() => equipos.filter((r) => coincide(busqueda, r.marca, r.modelo, r.patente, r.nombre)), [equipos, busqueda]);
  const filtrados = useMemo(() => buscados.filter((r) => !tipo || r.tipoTxt === tipo), [buscados, tipo]);
  const { visibles, hayMas, cargarMas } = useListPaging(filtrados);

  const tipos = [...new Set(buscados.map((r) => r.tipoTxt))].sort((a, b) => a.localeCompare(b, "es"));
  const opciones = [
    { value: null, label: "Todos", count: buscados.length },
    ...tipos.map((t) => ({ value: t, label: t, count: buscados.filter((r) => r.tipoTxt === t).length })),
  ];

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Equipos" subtitle={nombreMandante} count={estado.data ? filtrados.length : null} />
      <ScreenBody estado={estado}>
        <SearchBar value={busqueda} onChangeText={setBusqueda} placeholder="Buscar por marca, patente o N° de serie" />
        <FilterChips options={opciones} value={tipo} onChange={setTipo} />
        {filtrados.length === 0 ? <EmptyState message="No hay equipos que coincidan con el filtro." /> : null}
        {visibles.map((r) => (
          <ListCard key={r.id} onPress={() => navigation.navigate("DetalleEquipo", { recursoId: r.id })} accessibilityLabel={r.titulo}>
            <EntityAvatar tipo="equipo" tipoEquipo={r.tipo} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[typography.bodyBold, { color: colors.text }]} numberOfLines={2}>{r.titulo}</Text>
              <Text style={[typography.caption, { color: colors.textSubtle }]} numberOfLines={1}>
                {r.tipoTxt} · {r.empresaActual?.empresaNombre || "Sin empresa"}
              </Text>
              <EquipoIdentificador recurso={r} />
            </View>
            <StatusBadge estado={estadoNivel(r.nivel.clave)} style={{ maxWidth: 120 }} />
          </ListCard>
        ))}
        <VerMas visible={hayMas} onPress={cargarMas} />
      </ScreenBody>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
