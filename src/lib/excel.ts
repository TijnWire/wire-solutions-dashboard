import * as XLSX from "xlsx-js-style";

// Zet een lijst objecten om naar een ingevulde Excel-sheet en downloadt 'm.
export function exporteerExcel(
  rijen: Record<string, unknown>[],
  bestandsnaam: string,
  sheetnaam = "Blad1"
) {
  const ws = XLSX.utils.json_to_sheet(rijen);
  // Kolombreedtes automatisch op basis van de inhoud
  const kolommen = rijen.length ? Object.keys(rijen[0]) : [];
  ws["!cols"] = kolommen.map((k) => {
    const max = Math.max(
      k.length,
      ...rijen.map((r) => String(r[k] ?? "").length)
    );
    return { wch: Math.min(Math.max(max + 2, 10), 50) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetnaam);
  const naam = bestandsnaam.endsWith(".xlsx") ? bestandsnaam : `${bestandsnaam}.xlsx`;
  XLSX.writeFile(wb, naam);
}
