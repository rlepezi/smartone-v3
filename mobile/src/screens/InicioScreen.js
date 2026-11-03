import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LogOut, ShieldCheck, TriangleAlert, ChevronRight } from "lucide-react-native";
import { useAuth } from "../contexts/AuthContext";
import { useMandante } from "../contexts/MandanteContext";
import { useAsync } from "../hooks/useAsync";
import { dashboardService } from "../services/dashboardService";
import { colors, entityColors } from "../theme/colors";
import { entityIcons } from "../theme/entityIcons";
import { estadoNivel, TONO_VENCIDO } from "../theme/status";
import { spacing, radius, minTouchTarget } from "../theme/spacing";
import { typography, MAX_FONT_SCALE } from "../theme/typography";
import { ScreenHeader } from "../components/ScreenHeader";
import { ScreenBody } from "../components/ScreenBody";
import { MandanteSelector } from "../components/MandanteSelector";
import { SearchBar } from "../components/SearchBar";
import { SegmentBar } from "../components/SegmentBar";
import { StatusBadge } from "../components/StatusBadge";
import { Card } from "../components/Card";
import { ListCard } from "../components/ListCard";
import { EntityAvatar } from "../components/EntityAvatar";
import { EmptyState } from "../components/EmptyState";
import { Logo } from "../components/Logo";
import { expedienteConVencidos, textoPorcentaje } from "../utils/complianceStatus";
import { coincide, plural } from "../utils/texto";
import { tokenReset } from "../utils/navegacion";
import { formatNombre } from "../utils/formatNombre";
import { formatRut } from "../utils/formatRut";
import { nombreEquipo } from "../utils/identificacionEquipo";

// Contadores de "Estado de acreditación": cuentan EMPRESAS con expediente abierto, cada una en el
// peor estado de sus participaciones — el mismo criterio y la misma fuente que la lista de
// Empresas, para que al tocar un contador la lista muestre exactamente ese número. Suman el total
// ("Sin requerimientos" cuenta como Pendiente). "Vencidos" no es un estado: va como alerta aparte.
const BUCKETS = [
  { clave: "acreditada", label: "Acreditadas" },
  { clave: "aceptable", label: "Aceptables" },
  { clave: "rechazada", label: "Rechazadas" },
  { clave: "pendiente", label: "Pendientes" },
];
const bucketDe = (clave) => (clave === "sinRequerimientos" ? "pendiente" : clave);
const MAX_ATENCION = 5;
const MAX_POR_TIPO = 3;

export default function InicioScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { mandanteId, umbralesDe } = useMandante();
  const [busqueda, setBusqueda] = useState("");

  const estado = useAsync(
    ({ forzar } = {}) => dashboardService.obtener({ mandanteId, umbralesDe, forzar }),
    [mandanteId],
  );
  const data = estado.data;

  const resumen = useMemo(() => {
    if (!data) return null;
    const { indice } = data;
    const conteo = { acreditada: 0, aceptable: 0, rechazada: 0, pendiente: 0 };
    let totalEmpresas = 0;
    data.empresas.forEach((emp) => {
      const c = indice.empresa(emp.id);
      if (!c) return;
      conteo[bucketDe(c.clave)] += 1;
      totalEmpresas += 1;
    });
    const filas = indice.expedientes.map((e) => ({
      expediente: e, nivel: indice.nivelExpediente(e), vencidos: expedienteConVencidos(e),
    }));
    const empresas = Object.fromEntries(data.empresas.map((x) => [x.id, x]));
    const proyectos = Object.fromEntries(data.proyectos.map((x) => [x.id, x]));
    // Requiere atención: primero los con vencidos, luego el menor %; se omiten los acreditados sin vencidos.
    const atencion = filas
      .filter((f) => f.vencidos || ["rechazada", "aceptable"].includes(f.nivel.clave))
      .sort((a, b) => (Number(b.vencidos) - Number(a.vencidos)) || ((a.nivel.pct ?? 101) - (b.nivel.pct ?? 101)))
      .slice(0, MAX_ATENCION)
      .map((f) => ({
        ...f,
        empresaNombre: empresas[f.expediente.empresaId]?.razonSocial || "Empresa",
        proyectoNombre: proyectos[f.expediente.proyectoId]?.nombre || "Proyecto",
      }));
    return { total: totalEmpresas, conteo, conVencidos: filas.filter((f) => f.vencidos).length, atencion };
  }, [data]);

  const resultados = useMemo(() => {
    const q = busqueda.trim();
    if (!data || q.length < 2) return null;
    return {
      proyectos: data.proyectos.filter((p) => coincide(q, p.nombre, p.codigo)).slice(0, MAX_POR_TIPO),
      empresas: data.empresas.filter((e) => coincide(q, e.razonSocial, e.nombreFantasia, e.rut)).slice(0, MAX_POR_TIPO),
      personas: data.personas.filter((p) => coincide(q, `${p.nombre} ${p.apellido}`, p.rut)).slice(0, MAX_POR_TIPO),
      equipos: data.recursos.filter((r) => coincide(q, r.marca, r.modelo, r.patente, r.nombre)).slice(0, MAX_POR_TIPO),
    };
  }, [busqueda, data]);

  // Navega a otra pestaña dejando su lista debajo (volver regresa a la lista).
  const ir = (tab, screen, params) => navigation.navigate(tab, { screen, params, initial: false });
  // Abre una lista con sus filtros reiniciados ("Todos"), más el filtro que se pase.
  const irALista = (tab, screen, params = {}) => navigation.navigate(tab, { screen, params: { ...params, reset: tokenReset() } });

  return (
    <View style={styles.screen}>
      <ScreenHeader
        left={(
          <View style={{ gap: spacing.sm }}>
            <Logo height={26} />
            <MandanteSelector />
          </View>
        )}
        right={(
          <View style={styles.headerRight}>
            <EntityAvatar tipo="persona" nombre={user?.displayName || user?.email || ""} size={36} oscuro />
            <TouchableOpacity onPress={logout} style={styles.salir} accessibilityLabel="Cerrar sesión">
              <LogOut color={colors.onDark} size={20} />
            </TouchableOpacity>
          </View>
        )}
      />
      <ScreenBody estado={estado}>
        <SearchBar value={busqueda} onChangeText={setBusqueda} placeholder="Buscar proyecto, empresa, persona o equipo" />

        {resultados ? (
          <Card title="Resultados">
            <Resultados titulo="Proyectos" items={resultados.proyectos} render={(p) => ({
              key: p.id, tipo: "proyecto", nombre: p.nombre, sub: p.codigo,
              onPress: () => ir("Proyectos", "DetalleProyecto", { proyectoId: p.id }),
            })} />
            <Resultados titulo="Empresas" items={resultados.empresas} render={(e) => ({
              key: e.id, tipo: "empresa", nombre: e.razonSocial, sub: formatRut(e.rut),
              onPress: () => ir("Empresas", "DetalleEmpresa", { empresaId: e.id }),
            })} />
            <Resultados titulo="Personas" items={resultados.personas} render={(p) => ({
              key: p.id, tipo: "persona", nombre: formatNombre(`${p.nombre} ${p.apellido}`), sub: formatRut(p.rut),
              onPress: () => ir("Personas", "DetallePersona", { personaId: p.id }),
            })} />
            <Resultados titulo="Equipos" items={resultados.equipos} render={(r) => ({
              key: r.id, tipo: "equipo", tipoEquipo: r.tipo, nombre: nombreEquipo(r), sub: r.tipo,
              onPress: () => ir("Equipos", "DetalleEquipo", { recursoId: r.id }),
            })} />
            {!resultados.proyectos.length && !resultados.empresas.length && !resultados.personas.length && !resultados.equipos.length ? (
              <EmptyState title="Sin resultados" message={`No hay coincidencias para "${busqueda.trim()}".`} />
            ) : null}
          </Card>
        ) : null}

        {resumen ? (
          <>
            <Card title="Estado de acreditación" right={<ShieldCheck color={colors.primary} size={20} />}>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {plural(resumen.total, "empresa")} con expediente abierto
              </Text>
              {resumen.total === 0 ? (
                <EmptyState title="Sin expedientes" message="No hay empresas con expediente abierto para este mandante." />
              ) : (
                <>
                  <SegmentBar height={10} segments={BUCKETS.map((b) => ({ value: resumen.conteo[b.clave], color: estadoNivel(b.clave).dot }))} />
                  <View style={styles.contadores}>
                    {BUCKETS.filter((b) => b.clave !== "pendiente" || resumen.conteo.pendiente > 0).map((b) => {
                      const e = estadoNivel(b.clave);
                      return (
                        <TouchableOpacity key={b.clave} style={[styles.contador, { backgroundColor: e.bg }]}
                          onPress={() => irALista("Empresas", "ListaEmpresas", { estadoInicial: b.clave })}
                          accessibilityLabel={`${resumen.conteo[b.clave]} ${b.label}`}>
                          <Text style={[typography.display, { color: e.fg, fontSize: 24 }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                            {resumen.conteo[b.clave]}
                          </Text>
                          <Text style={[typography.label, { color: e.fg }]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>{b.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </Card>

            {resumen.conVencidos > 0 ? (
              <View style={[styles.alerta, { backgroundColor: TONO_VENCIDO.bg }]}>
                <TriangleAlert color={TONO_VENCIDO.fg} size={20} />
                <Text style={[typography.bodyBold, { color: TONO_VENCIDO.fg, flex: 1 }]}>
                  {plural(resumen.conVencidos, "expediente")} con documentos vencidos
                </Text>
              </View>
            ) : null}

            <View style={styles.accesos}>
              <Acceso entidad="proyectos" label="Proyectos" n={data.proyectos.length} onPress={() => irALista("Proyectos", "ListaProyectos")} />
              <Acceso entidad="empresas" label="Empresas" n={data.empresas.length} onPress={() => irALista("Empresas", "ListaEmpresas")} />
              <Acceso entidad="personas" label="Personas" n={data.personas.length} onPress={() => irALista("Personas", "ListaPersonas")} />
              <Acceso entidad="equipos" label="Equipos" n={data.recursos.length} onPress={() => irALista("Equipos", "ListaEquipos")} />
            </View>

            {resumen.atencion.length > 0 ? (
              <Card title="Requiere atención">
                {resumen.atencion.map(({ expediente, nivel, vencidos, empresaNombre, proyectoNombre }) => (
                  <ListCard key={expediente.id} style={styles.filaAtencion}
                    onPress={() => ir("Empresas", "DetalleEmpresa", { empresaId: expediente.empresaId, proyectoId: expediente.proyectoId })}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[typography.bodyBold, { color: colors.text }]} numberOfLines={2}>{formatNombre(empresaNombre)}</Text>
                      <Text style={[typography.caption, { color: colors.textSubtle }]} numberOfLines={1}>{proyectoNombre}</Text>
                      <View style={styles.badges}>
                        <StatusBadge estado={estadoNivel(nivel.clave)} />
                        {vencidos ? <StatusBadge estado={{ label: "Con vencidos", ...TONO_VENCIDO }} /> : null}
                      </View>
                    </View>
                    <Text style={[typography.cardTitle, { color: estadoNivel(nivel.clave).fg }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                      {textoPorcentaje(nivel.pct)}
                    </Text>
                    <ChevronRight color={colors.textSubtle} size={18} />
                  </ListCard>
                ))}
              </Card>
            ) : null}
          </>
        ) : null}
      </ScreenBody>
    </View>
  );
}

function Acceso({ entidad, label, n, onPress }) {
  const Icono = entityIcons[entidad];
  const tono = entityColors[entidad];
  return (
    <TouchableOpacity style={styles.acceso} onPress={onPress} accessibilityLabel={`${label}: ${n}`}>
      <View style={[styles.accesoIcono, { backgroundColor: tono.bg }]}>
        <Icono color={tono.color} size={18} />
      </View>
      <Text style={[typography.cardTitle, { color: colors.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{n}</Text>
      <Text style={[typography.label, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>{label}</Text>
    </TouchableOpacity>
  );
}

function Resultados({ titulo, items, render }) {
  if (!items.length) return null;
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.label, { color: colors.textSubtle }]}>{titulo.toUpperCase()}</Text>
      {items.map((it) => {
        const r = render(it);
        return (
          <TouchableOpacity key={r.key} style={styles.resultado} onPress={r.onPress}>
            <EntityAvatar tipo={r.tipo} nombre={r.nombre} tipoEquipo={r.tipoEquipo} size={32} />
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodyBold, { color: colors.text }]} numberOfLines={1}>{r.nombre}</Text>
              {r.sub ? <Text style={[typography.caption, { color: colors.textSubtle }]} numberOfLines={1}>{r.sub}</Text> : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start" },
  salir: { width: minTouchTarget, height: minTouchTarget, alignItems: "center", justifyContent: "center" },
  contadores: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  contador: { flexGrow: 1, flexBasis: "45%", minHeight: 64, borderRadius: radius.button, padding: spacing.sm, alignItems: "center", justifyContent: "center" },
  alerta: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.card, marginBottom: spacing.md },
  accesos: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  acceso: {
    flex: 1, minHeight: 88, alignItems: "center", justifyContent: "center", gap: 2,
    backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.sm,
  },
  accesoIcono: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  filaAtencion: { marginBottom: 0, backgroundColor: colors.bg, borderWidth: 0 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  resultado: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: minTouchTarget },
});
