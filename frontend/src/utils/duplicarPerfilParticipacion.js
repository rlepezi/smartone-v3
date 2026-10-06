import { perfilParticipacionService } from "../services/perfilParticipacionService";
import { perfilRequerimientoService } from "../services/perfilRequerimientoService";

// Orquesta crear un Perfil nuevo + copiar los vínculos de Requerimiento
// activos del original, con sus mismos Perfiles de Recurso ("Aplica a") —
// compartido entre PerfilParticipacionDetailPage.jsx y
// PerfilesParticipacionListPage.jsx para no duplicar la lógica.
// Un solo llamado a sincronizar: el backend asigna el "orden" en el mismo
// orden en que llegan los cambios (por eso van ordenados como el original).
export const duplicarPerfilParticipacion = async (perfil) => {
  const matriz = await perfilRequerimientoService.obtenerMatriz(perfil.id);
  const vinculos = (matriz || [])
    .filter((r) => r.vinculado)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  const nuevo = await perfilParticipacionService.crear({
    nombre: `${perfil.nombre} (copia)`,
    descripcion: perfil.descripcion,
    mandanteId: perfil.mandanteId,
  });

  if (vinculos.length > 0) {
    try {
      await perfilRequerimientoService.sincronizar(vinculos.map((v) => ({
        perfilParticipacionId: nuevo.id,
        requerimientoId: v.id,
        activo: true,
        perfilRecursoIds: v.perfilRecursoIds ?? null,
      })));
    } catch (err) {
      console.error("No se pudieron copiar los vínculos de Requerimientos:", err);
    }
  }

  return nuevo;
};
