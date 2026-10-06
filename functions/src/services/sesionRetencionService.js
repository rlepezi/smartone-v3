const sesionRepository = require("../repositories/sesionRepository");

const MESES_RETENCION = 12;
const LOTE = 500;
// Tope de lotes por corrida: evita timeouts de la scheduled function si se
// acumuló mucho volumen histórico; lo que sobre se limpia en la corrida
// del mes siguiente (la retención es "12 meses", no un corte exacto al
// segundo).
const MAX_LOTES_POR_CORRIDA = 20;

/**
 * Retención de Sesiones (telemetría) — Fase B. EXCEPCIÓN DOCUMENTADA a la
 * regla de "no hay eliminación física" del resto del sistema: son datos
 * de telemetría de accesos, no registros operacionales/de negocio, y se
 * purgan pasados 12 meses vía una scheduled function mensual.
 */
class SesionRetencionService {
  /**
   * Borra en lotes las sesiones con `inicio` anterior al corte de 12
   * meses.
   * @return {Promise<number>} Cantidad total de sesiones purgadas en esta
   *     corrida.
   */
  async purgarVencidas() {
    const corte = new Date();
    corte.setMonth(corte.getMonth() - MESES_RETENCION);

    let totalPurgadas = 0;
    for (let i = 0; i < MAX_LOTES_POR_CORRIDA; i++) {
      const lote = await sesionRepository.getAnterioresA(corte, LOTE);
      if (lote.length === 0) break;
      await sesionRepository.borrarLote(lote.map((s) => s.id));
      totalPurgadas += lote.length;
      if (lote.length < LOTE) break;
    }
    return totalPurgadas;
  }
}

module.exports = new SesionRetencionService();
