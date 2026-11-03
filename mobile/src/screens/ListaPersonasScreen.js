import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SlidersHorizontal } from "lucide-react-native";
import { useMandante } from "../contexts/MandanteContext";
import { useAsync } from "../hooks/useAsync";
import { useListPaging } from "../hooks/useListPaging";
import { personaService } from "../services/personaService";
import { colors } from "../theme/colors";
import { estadoNivel } from "../theme/status";
import { spacing, radius, minTouchTarget } from "../theme/spacing";
import { typography } from "../theme/typography";
import { ScreenHeader } from "../components/ScreenHeader";
import { ScreenBody } from "../components/ScreenBody";
import { useNombreMandante } from "../components/MandanteSelector";
import { SearchBar } from "../components/SearchBar";
import { FilterChips } from "../components/FilterChips";
import { OptionSheet } from "../components/OptionSheet";
import { ListCard } from "../components/ListCard";
import { StatusBadge } from "../components/StatusBadge";
import { EntityAvatar } from "../components/EntityAvatar";
import { EmptyState } from "../components/EmptyState";
import { VerMas } from "../components/VerMas";
import { formatRut } from "../utils/formatRut";
import { formatNombre } from "../utils/formatNombre";
import { coincide } from "../utils/texto";

const FILTROS = [
  { value: "acreditada", label: "Acreditadas" },
  { value: "aceptable", label: "Aceptables" },
  { value: "rechazada", label: "Rechazadas" },
  { value: "pendiente", label: "Pendientes" },
  { value: "sinEmpresa", label: "Sin empresa" },
];
const ESTADOS_SIEMPRE = ["acreditada", "aceptable", "rechazada", "sinEmpresa"];

// Persona dentro de un filtro ("Sin requerimientos" cuenta como Pendiente).
const enFiltro = (p, f) => (f === "sinEmpresa" ? !p.empresaActual :
  f === "pendiente" ? ["pendiente", "sinRequerimientos"].includes(p.nivel.clave) : p.nivel.clave === f);

export default function ListaPersonasScreen({ route, navigation }) {
  const { mandanteId, umbralesDe } = useMandante();
  const nombreMandante = useNombreMandante();
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [eligiendoEmpresa, setEligiendoEmpresa] = useState(false);

  // Abierta desde un acceso (Inicio, detalle de proyecto): filtros en "Todos" y sin búsqueda.
  const [paramsPrevios, setParamsPrevios] = useState(route.params);
  if (route.params !== paramsPrevios) {
    setParamsPrevios(route.params);
    if (route.params?.reset) {
      setBusqueda("");
      setFiltro(null);
      setEmpresaId(null);
    }
  }

  const estado = useAsync(
    ({ forzar } = {}) => personaService.listar({ mandanteId, umbralesDe, forzar }),
    [mandanteId],
  );

  const personas = useMemo(() => (estado.data?.personas || []).map((p) => ({
    ...p,
    nombreCompleto: formatNombre(`${p.nombre || ""} ${p.apellido || ""}`),
    nivel: estado.data.indice.persona(p.id),
  })).sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, "es")), [estado.data]);

  const empresas = useMemo(() => {
    const m = new Map();
    personas.forEach((p) => { if (p.empresaActual?.empresaId) m.set(p.empresaActual.empresaId, p.empresaActual.empresaNombre || "Empresa"); });
    return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [personas]);

  const buscadas = useMemo(() => personas.filter((p) =>
    coincide(busqueda, p.nombreCompleto, p.rut) && (!empresaId || p.empresaActual?.empresaId === empresaId)),
  [personas, busqueda, empresaId]);

  const filtradas = useMemo(() => buscadas.filter((p) => !filtro || enFiltro(p, filtro)), [buscadas, filtro]);
  const { visibles, hayMas, cargarMas } = useListPaging(filtradas);

  const opciones = [
    { value: null, label: "Todas", count: buscadas.length },
    ...FILTROS.map((f) => ({ ...f, count: buscadas.filter((p) => enFiltro(p, f.value)).length }))
      .filter((f) => f.count > 0 || f.value === filtro || ESTADOS_SIEMPRE.includes(f.value)),
  ];
  const nombreEmpresa = empresas.find((e) => e.value === empresaId)?.label;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Personas" subtitle={nombreMandante} count={estado.data ? filtradas.length : null} />
      <ScreenBody estado={estado}>
        <SearchBar
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar por nombre o RUT"
          right={(
            <TouchableOpacity style={[styles.filtro, empresaId && styles.filtroActivo]} onPress={() => setEligiendoEmpresa(true)}
              accessibilityLabel="Filtrar por empresa">
              <SlidersHorizontal color={empresaId ? colors.onDark : colors.textMuted} size={18} />
            </TouchableOpacity>
          )}
        />
        {empresaId ? (
          <TouchableOpacity onPress={() => setEmpresaId(null)} style={styles.empresaFiltro}>
            <Text style={[typography.caption, { color: colors.primary }]} numberOfLines={1}>Empresa: {nombreEmpresa} · Quitar</Text>
          </TouchableOpacity>
        ) : null}
        <FilterChips options={opciones} value={filtro} onChange={setFiltro} />
        {filtradas.length === 0 ? <EmptyState message="No hay personas que coincidan con el filtro." /> : null}
        {visibles.map((p) => (
          <ListCard key={p.id} onPress={() => navigation.navigate("DetallePersona", { personaId: p.id })} accessibilityLabel={p.nombreCompleto}>
            <EntityAvatar tipo="persona" nombre={p.nombreCompleto} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[typography.bodyBold, { color: colors.text }]} numberOfLines={2}>{p.nombreCompleto}</Text>
              <Text style={[typography.caption, { color: colors.textSubtle }]} numberOfLines={1}>
                {formatRut(p.rut)} · {p.empresaActual?.empresaNombre || "Sin empresa"}
              </Text>
            </View>
            <StatusBadge estado={estadoNivel(p.nivel.clave)} style={{ maxWidth: 120 }} />
          </ListCard>
        ))}
        <VerMas visible={hayMas} onPress={cargarMas} />
      </ScreenBody>
      <OptionSheet
        visible={eligiendoEmpresa}
        title="Filtrar por empresa"
        options={[{ value: null, label: "Todas las empresas" }, ...empresas]}
        value={empresaId}
        onChange={setEmpresaId}
        onClose={() => setEligiendoEmpresa(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  filtro: {
    width: minTouchTarget, minHeight: minTouchTarget, alignItems: "center", justifyContent: "center",
    borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  filtroActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  empresaFiltro: { marginTop: -spacing.xs, marginBottom: spacing.sm },
});

