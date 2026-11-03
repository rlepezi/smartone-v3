import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { ArrowUpDown } from "lucide-react-native";
import { useAuth } from "../contexts/AuthContext";
import { useMandante } from "../contexts/MandanteContext";
import { can } from "../permissions/can";
import { useAsync } from "../hooks/useAsync";
import { useListPaging } from "../hooks/useListPaging";
import { empresaService } from "../services/empresaService";
import { colors } from "../theme/colors";
import { estadoNivel } from "../theme/status";
import { spacing, radius, minTouchTarget } from "../theme/spacing";
import { typography, MAX_FONT_SCALE } from "../theme/typography";
import { ScreenHeader } from "../components/ScreenHeader";
import { ScreenBody } from "../components/ScreenBody";
import { useNombreMandante } from "../components/MandanteSelector";
import { SearchBar } from "../components/SearchBar";
import { FilterChips } from "../components/FilterChips";
import { ListCard } from "../components/ListCard";
import { StatusBadge } from "../components/StatusBadge";
import { PercentRing } from "../components/PercentRing";
import { EntityAvatar } from "../components/EntityAvatar";
import { EmptyState } from "../components/EmptyState";
import { VerMas } from "../components/VerMas";
import { formatRut } from "../utils/formatRut";
import { coincide, plural } from "../utils/texto";

const FILTROS = [
  { value: "acreditada", label: "Acreditadas" },
  { value: "aceptable", label: "Aceptables" },
  { value: "rechazada", label: "Rechazadas" },
  { value: "pendiente", label: "Pendientes" },
  { value: "sinParticipacion", label: "Sin participación" },
];
// "Sin requerimientos" se agrupa con Pendientes (mismo criterio que Inicio).
const filtroDe = (clave) => (clave === "sinRequerimientos" ? "pendiente" : clave);

export default function ListaEmpresasScreen({ route, navigation }) {
  const { rol } = useAuth();
  const conCumplimiento = can(rol, "ver_operacion");
  const { mandanteId, umbralesDe } = useMandante();
  const nombreMandante = useNombreMandante();
  const [busqueda, setBusqueda] = useState(route.params?.busquedaInicial || "");
  const [filtro, setFiltro] = useState(route.params?.estadoInicial || null);
  const [menorPrimero, setMenorPrimero] = useState(false);

  // Abierta desde Inicio (contador o acceso): se aplica su filtro, o "Todas" (sin espejar en un efecto).
  const [paramsPrevios, setParamsPrevios] = useState(route.params);
  if (route.params !== paramsPrevios) {
    setParamsPrevios(route.params);
    if (route.params?.reset) {
      setBusqueda(route.params.busquedaInicial || "");
      setFiltro(route.params.estadoInicial || null);
      setMenorPrimero(false);
    }
  }

  const estado = useAsync(
    ({ forzar } = {}) => empresaService.listar({ mandanteId, umbralesDe, forzar, conCumplimiento }),
    [mandanteId, conCumplimiento],
  );

  const empresas = useMemo(() => (estado.data?.empresas || []).map((e) => {
    const c = estado.data.indice?.empresa(e.id) || null;
    return { ...e, cumplimiento: c, filtro: c ? filtroDe(c.clave) : "sinParticipacion" };
  }), [estado.data]);

  const buscadas = useMemo(
    () => empresas.filter((e) => coincide(busqueda, e.razonSocial, e.nombreFantasia, e.rut)),
    [empresas, busqueda],
  );
  const filtradas = useMemo(() => {
    const lista = buscadas.filter((e) => !filtro || e.filtro === filtro);
    const porNombre = (a, b) => String(a.razonSocial || "").localeCompare(String(b.razonSocial || ""), "es");
    if (!menorPrimero) return [...lista].sort(porNombre);
    return [...lista].sort((a, b) => ((a.cumplimiento?.pct ?? 101) - (b.cumplimiento?.pct ?? 101)) || porNombre(a, b));
  }, [buscadas, filtro, menorPrimero]);
  const { visibles, hayMas, cargarMas } = useListPaging(filtradas);

  const opciones = [
    { value: null, label: "Todas", count: buscadas.length },
    ...FILTROS.map((f) => ({ ...f, count: buscadas.filter((e) => e.filtro === f.value).length }))
      .filter((f) => f.count > 0 || f.value === filtro || ["acreditada", "aceptable", "rechazada"].includes(f.value)),
  ];

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Empresas" subtitle={nombreMandante} count={estado.data ? filtradas.length : null} />
      <ScreenBody estado={estado}>
        <SearchBar
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar por nombre o RUT"
          right={conCumplimiento ? (
            <TouchableOpacity
              style={[styles.orden, menorPrimero && styles.ordenActivo]}
              onPress={() => setMenorPrimero((v) => !v)}
              accessibilityLabel="Ordenar por menor cumplimiento"
              accessibilityState={{ selected: menorPrimero }}
            >
              <ArrowUpDown color={menorPrimero ? colors.onDark : colors.textMuted} size={16} />
              <Text style={[typography.label, { color: menorPrimero ? colors.onDark : colors.textMuted }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                Menor %
              </Text>
            </TouchableOpacity>
          ) : null}
        />
        {conCumplimiento ? <FilterChips options={opciones} value={filtro} onChange={setFiltro} /> : null}
        {filtradas.length === 0 ? <EmptyState message="No hay empresas que coincidan con el filtro." /> : null}
        {visibles.map((e) => (
          <ListCard key={e.id} onPress={() => navigation.navigate("DetalleEmpresa", { empresaId: e.id })} accessibilityLabel={e.razonSocial}>
            <EntityAvatar tipo="empresa" nombre={e.nombreFantasia || e.razonSocial} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[typography.bodyBold, { color: colors.text }]} numberOfLines={2}>{e.razonSocial}</Text>
              <Text style={[typography.caption, { color: colors.textSubtle }]} numberOfLines={1}>
                {formatRut(e.rut)}{e.cumplimiento ? ` · ${plural(e.cumplimiento.proyectos, "proyecto")}` : ""}
              </Text>
              {conCumplimiento ? <StatusBadge estado={estadoNivel(e.cumplimiento?.clave || "sinParticipacion")} /> : null}
            </View>
            {e.cumplimiento ? <PercentRing pct={e.cumplimiento.pct} color={estadoNivel(e.cumplimiento.clave).dot} /> : null}
          </ListCard>
        ))}
        <VerMas visible={hayMas} onPress={cargarMas} />
      </ScreenBody>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  orden: {
    minHeight: minTouchTarget, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md,
    borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  ordenActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
});
