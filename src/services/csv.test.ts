import { describe, expect, it } from 'vitest'
import { parseCsv, parseCsvRecords } from './csv'

describe('parseCsv', () => {
  it('splits simple rows and fields', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles CRLF line endings and a missing trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles quoted fields containing commas, newlines and escaped quotes', () => {
    expect(parseCsv('"x, y","line1\nline2","say ""hi"""\n')).toEqual([
      ['x, y', 'line1\nline2', 'say "hi"'],
    ])
  })

  it('preserves empty fields', () => {
    expect(parseCsv('a,,c\n')).toEqual([['a', '', 'c']])
  })

  it('preserves a trailing empty field without a final newline', () => {
    expect(parseCsv('a,b,')).toEqual([['a', 'b', '']])
  })

  it('drops blank lines', () => {
    expect(parseCsv('a\n\n  \nb\n')).toEqual([['a'], ['b']])
  })

  it('returns no rows for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('parseCsvRecords', () => {
  it('keys rows by trimmed header and fills missing cells with ""', () => {
    expect(parseCsvRecords(' id , name \n1,Ann\n2\n')).toEqual([
      { id: '1', name: 'Ann' },
      { id: '2', name: '' },
    ])
  })

  it('returns [] when there is no header', () => {
    expect(parseCsvRecords('')).toEqual([])
  })
})
