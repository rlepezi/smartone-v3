const MS_DIA = 1000 * 60 * 60 * 24;

const aFecha = (valor) => {
  if (!valor) return null;
  const fecha = valor._seconds ? new Date(valor._seconds * 1000) : new Date(valor);
  return isNaN(fecha.getTime()) ? null : fecha;
};

const inicioDelDia = (fecha) => {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Estado del cronograma de un Proyecto (calculado, no se guarda) y su duración.
//
// Fechas de referencia:
//   inicio = fechaInicioEfectiva, o si no hay, fechaInicio (planificada).
//   fin    = fechaTerminoReal (término efectivo) si ya cerró; si no,
//            fechaTerminoReprogramada si existe (es el plan vigente); si no,
//            fechaTermino (planificada).
//
// Regla (en este orden, la primera que aplique):
//   1. Tiene fechaTerminoReal (término efectivo)  -> "finalizado".
//   2. Hoy es anterior al inicio                   -> "por_iniciar".
//   3. Hay fin y hoy es posterior al fin, sin cerrar -> "retrasado".
//   4. En cualquier otro caso (hoy dentro del rango, o sin fin definido)
//                                                  -> "en_curso".
// Sin fecha de inicio no se puede evaluar         -> "sin_datos".
//
// `dias` = días entre inicio y fin (ambos incluidos); null si falta alguno.
export const ESTADOS_CRONOGRAMA = {
  por_iniciar: { label: "Por iniciar", className: "bg-primary-lighter text-primary-dark border-primary-light" },
  en_curso: { label: "En curso", className: "bg-sage-lighter text-sage-darker border-sage-light" },
  retrasado: { label: "Retrasado", className: "bg-red-50 text-red-700 border-red-200" },
  finalizado: { label: "Finalizado", className: "bg-slate-100 text-slate-600 border-slate-200" },
  sin_datos: { label: "Sin datos", className: "bg-slate-100 text-slate-500 border-slate-200" },
};

export const calcularCronograma = (
  { fechaInicio, fechaInicioEfectiva, fechaTermino, fechaTerminoReprogramada, fechaTerminoReal },
  ahora = Date.now(),
) => {
  const inicio = aFecha(fechaInicioEfectiva) || aFecha(fechaInicio);
  const real = aFecha(fechaTerminoReal);
  const fin = real || aFecha(fechaTerminoReprogramada) || aFecha(fechaTermino);

  const dias = inicio && fin
    ? Math.round((inicioDelDia(fin) - inicioDelDia(inicio)) / MS_DIA) + 1
    : null;

  if (!inicio) return { estado: "sin_datos", dias };
  if (real) return { estado: "finalizado", dias };

  const hoy = inicioDelDia(ahora);
  if (hoy < inicioDelDia(inicio)) return { estado: "por_iniciar", dias };
  if (fin && hoy > inicioDelDia(fin)) return { estado: "retrasado", dias };
  return { estado: "en_curso", dias };
};
