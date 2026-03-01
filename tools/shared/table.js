export function detectDelimiter(text) {
  if (!text) return "\t";
  if (text.includes("\t")) return "\t";
  if (text.includes(",")) return ",";
  return "\t";
}

export function parseTable(text, delimiter = "\t") {
  if (!text) return { headers: [], rows: [] };
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length);

  if (!lines.length) return { headers: [], rows: [] };

  const headers = lines[0].split(delimiter).map((cell) => cell.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(delimiter).map((cell) => cell.trim());
    if (cells.length < headers.length) {
      return cells.concat(Array.from({ length: headers.length - cells.length }, () => ""));
    }
    return cells.slice(0, headers.length);
  });

  return { headers, rows };
}
