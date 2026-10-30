// CSV para Excel en español: separador ";" y BOM UTF-8 (para que abra con tildes).
const BOM_UTF8 = "﻿";

const aCsv = (filas) => filas
  .map((f) => f.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
  .join("\r\n");

// Descarga `filas` (arreglo de arreglos) como un archivo CSV.
export const descargarCsv = (nombre, filas) => {
  const blob = new Blob([BOM_UTF8, aCsv(filas)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
