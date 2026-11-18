interface ParserState {
  rows: string[][]
  row: string[]
  field: string
  inQuotes: boolean
}

function endField(state: ParserState): void {
  state.row.push(state.field)
  state.field = ''
}

function endRow(state: ParserState): void {
  endField(state)
  state.rows.push(state.row)
  state.row = []
}

/** Handles one character inside a quoted field; returns how many extra characters were consumed. */
function readQuoted(state: ParserState, char: string, next: string | undefined): number {
  if (char !== '"') {
    state.field += char
    return 0
  }
  if (next === '"') {
    state.field += '"'
    return 1
  }
  state.inQuotes = false
  return 0
}

function startQuotes(state: ParserState): void {
  state.inQuotes = true
}

function ignoreChar(): void {}

/** Structural characters outside quotes; anything else is appended to the current field. */
const UNQUOTED_HANDLERS = new Map<string, (state: ParserState) => void>([
  ['"', startQuotes],
  [',', endField],
  ['\n', endRow],
  ['\r', ignoreChar],
])

function readUnquoted(state: ParserState, char: string): void {
  const handler = UNQUOTED_HANDLERS.get(char)
  if (handler) handler(state)
  else state.field += char
}

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === '')
}

/** RFC 4180-style CSV parser supporting quoted fields, escaped quotes and CRLF line endings. */
export function parseCsv(text: string): string[][] {
  const state: ParserState = { rows: [], row: [], field: '', inQuotes: false }
  for (let i = 0; i < text.length; i++) {
    if (state.inQuotes) {
      i += readQuoted(state, text[i], text[i + 1])
    } else {
      readUnquoted(state, text[i])
    }
  }
  if (state.field !== '' || state.row.length > 0) endRow(state)
  return state.rows.filter((row) => !isBlankRow(row))
}

/** Parses CSV text into objects keyed by the (trimmed) header row. Missing cells become "". */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const [header, ...body] = parseCsv(text)
  if (!header) return []
  const keys = header.map((key) => key.trim())
  return body.map((cells) =>
    Object.fromEntries(keys.map((key, index) => [key, cells[index] ?? ''])),
  )
}
