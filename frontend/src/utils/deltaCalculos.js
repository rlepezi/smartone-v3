// Helpers de fecha/delta compartidos — antes vivían duplicados (con
// distintas ventanas de tiempo) en cada pantalla que los necesitaba.

export const createdAtMillis = (item) => {
  if (item?.createdAt?._seconds) return item.createdAt._seconds * 1000;
  if (item?.createdAt) return new Date(item.createdAt).getTime() || 0;
  return 0;
};

const DIA_MS = 24 * 60 * 60 * 1000;

// Delta real (no inventado): compara cuántos registros se crearon en el
// período actual (los últimos `diasPeriodo` días) contra el período
// anterior de igual longitud, sobre datos ya cargados en memoria — sin
// llamada nueva. Si no hay ningún registro en el período anterior, no
// hay base real de comparación (ir de 0 a N sería un delta engañoso tipo
// "+100%") — se omite devolviendo null, y el llamador no debe renderizar
// nada en ese caso.
export const calcularDeltaPeriodo = (items, diasPeriodo = 7) => {
  if (!items || items.length === 0) return null;
  const ahora = Date.now();
  const ventana = diasPeriodo * DIA_MS;
  const actual = items.filter((it) => createdAtMillis(it) >= ahora - ventana).length;
  const anterior = items.filter((it) => {
    const t = createdAtMillis(it);
    return t < ahora - ventana && t >= ahora - 2 * ventana;
  }).length;
  if (anterior === 0) return null;
  return actual - anterior;
};
