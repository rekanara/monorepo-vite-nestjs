export class CsvParseError extends Error {
  constructor(readonly row: number) {
    super(`Unterminated quoted field starting at row ${row}`)
  }
}

/** Delimiter by counting `,` vs `;` outside quotes in the header line; ties -> `,`. */
function detectDelimiter(text: string): string {
  let quoted = false
  let commas = 0
  let semis = 0
  for (const c of text) {
    if (c === '"') quoted = !quoted
    else if (!quoted && (c === "\n" || c === "\r")) break
    else if (!quoted && c === ",") commas++
    else if (!quoted && c === ";") semis++
  }
  return semis > commas ? ";" : ","
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "")
  const delim = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  let quoteRow = 0

  const endField = () => {
    row.push(field)
    field = ""
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = false
    } else if (c === '"' && field === "") {
      quoted = true
      quoteRow = rows.length + 1
    } else if (c === delim) endField()
    else if (c === "\n") endRow()
    else if (c === "\r") {
      if (text[i + 1] === "\n") i++
      endRow()
    } else field += c
  }
  if (quoted) throw new CsvParseError(quoteRow)
  if (field !== "" || row.length > 0) endRow()

  while (rows.length > 0 && rows.at(-1)?.every((c) => c === "")) rows.pop()
  return rows
}

const FORMULA = /^[=+\-@\t\r]/

/** Spreadsheet-safe cell: neutralises formula injection, quotes when needed. */
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value)
  if (FORMULA.test(text)) text = `'${text}`
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(rows: unknown[][]): string {
  return `\uFEFF${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`
}
