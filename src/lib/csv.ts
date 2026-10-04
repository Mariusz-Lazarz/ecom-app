/**
 * Builds CSV text (RFC 4180, CRLF line ends). Fields with a comma, quote or line break are quoted,
 * quotes doubled; a field starting with `=`, `+`, `-`, `@`, a tab or a carriage return gets a
 * leading `'` so spreadsheets don't run it as a formula.
 */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]) {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n"
}

function csvField(value: string | number | null | undefined) {
  let text = value == null ? "" : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
