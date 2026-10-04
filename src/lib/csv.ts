/**
 * Builds CSV text (RFC 4180, CRLF line ends). Fields with a comma, quote or line break are quoted,
 * quotes doubled. A text field starting with `=`, `+`, `-`, `@`, a tab or a carriage return gets a
 * leading `'` so spreadsheets don't run it as a formula; numbers are written as they are, so a
 * negative amount stays a number. null and undefined become empty fields.
 */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]) {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n"
}

function csvField(value: string | number | null | undefined) {
  if (value == null) return ""
  let text = String(value)
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
