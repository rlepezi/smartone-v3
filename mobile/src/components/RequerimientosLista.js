import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { spacing } from "../theme/spacing";
import { estadoDeRequerimiento } from "../utils/complianceStatus";
import { Card } from "./Card";
import { FilterChips } from "./FilterChips";
import { RequirementRow } from "./RequirementRow";
import { EmptyState } from "./EmptyState";

// Orden de los filtros; "Vencidos" y "No aplica" solo aparecen si hay alguno.
const FILTROS = [
  { value: "rechazado", label: "Rechazados" },
  { value: "vencido", label: "Vencidos", soloSiHay: true },
  { value: "sinRevisar", label: "Sin revisar" },
  { value: "aprobado", label: "Aprobados" },
  { value: "noAplica", label: "No aplica", soloSiHay: true },
];

// Requerimientos de un sujeto (filas de evaluacionService.filasDeSujeto): filtros con contador
// y lista numerada, con el NOMBRE CORTO de cada requerimiento (el largo si no tiene). La fecha de vencimiento se muestra cuando el requerimiento la exige o la trae.
export function RequerimientosLista({ titulo, filas, cargando, vacio = "Sin requerimientos." }) {
  const [filtro, setFiltro] = useState(null);
  const conEstado = useMemo(() => (filas || []).map((f, i) => ({
    ...f, numero: i + 1, estado: estadoDeRequerimiento(f),
  })), [filas]);
  const visibles = conEstado.filter((f) => !filtro || f.estado === filtro);
  const contar = (v) => conEstado.filter((f) => f.estado === v).length;
  const opciones = [
    { value: null, label: "Todos", count: conEstado.length },
    ...FILTROS.map((f) => ({ ...f, count: contar(f.value) })).filter((f) => !f.soloSiHay || f.count > 0 || f.value === filtro),
  ];

  return (
    <Card title={titulo}>
      {cargando && !filas ? <EmptyState title="Cargando requerimientos..." /> : null}
      {filas && conEstado.length === 0 ? <EmptyState message={vacio} /> : null}
      {conEstado.length > 0 ? (
        <>
          <FilterChips options={opciones} value={filtro} onChange={setFiltro} />
          <View style={{ gap: spacing.xs }}>
            {visibles.map((f) => (
              <RequirementRow
                key={`${f.requerimiento.requerimientoId}-${f.numero}`}
                numero={f.numero}
                nombre={f.requerimiento.nombreCorto || f.requerimiento.nombre}
                estado={f.estado}
                fechaVencimiento={f.requerimiento.requiereVencimiento || f.evaluacion?.fechaVencimiento ? f.evaluacion?.fechaVencimiento : null}
              />
            ))}
            {visibles.length === 0 ? <EmptyState message="Ningún requerimiento en este filtro." /> : null}
          </View>
        </>
      ) : null}
    </Card>
  );
}
