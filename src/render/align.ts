import { decodeNamedCharacterReference } from 'decode-named-character-reference'

/**
 * Zeichengenaue Zuordnung eines gerenderten Textes zu seinem Markdown-Quelltext.
 * Für Zeichen i des gerenderten Textes liegt seine Quelldarstellung in
 * source[starts[i], ends[i]) – meist genau ein Zeichen, bei Escapes (`\*`)
 * oder Zeichenreferenzen (`&amp;`) mehrere.
 */
export type CharMap = { starts: number[]; ends: number[] }

const ASCII_PUNCT = /[!-/:-@[-`{-~]/

const CHAR_REF = /^&(?:#[xX]([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([A-Za-z][A-Za-z0-9]{0,31}));/

function matchCharRef(source: string, at: number): { length: number; decoded: string } | null {
  const m = CHAR_REF.exec(source.slice(at, at + 40))
  if (!m) return null
  let decoded: string | false
  if (m[1] !== undefined || m[2] !== undefined) {
    const code = m[1] !== undefined ? parseInt(m[1], 16) : parseInt(m[2], 10)
    decoded = code === 0 || code > 0x10ffff ? '�' : String.fromCodePoint(code)
  } else {
    decoded = decodeNamedCharacterReference(m[3])
  }
  return decoded ? { length: m[0].length, decoded } : null
}

export type AlignOptions = {
  /** In Inline-Code werden Zeilenumbrüche des Quelltexts als Leerzeichen gerendert. */
  lineEndingAsSpace?: boolean
  /** Escapes und Zeichenreferenzen auswerten (nicht in Code). */
  decode?: boolean
}

/**
 * Richtet `value` (gerenderter Text eines mdast-Knotens) an `source`
 * (Quelltextausschnitt ab Offset `offset`) aus. Quellzeichen, die keinem
 * gerenderten Zeichen entsprechen (Container-Präfixe wie `> ` oder
 * Einrückungen auf Folgezeilen), werden übersprungen.
 * Liefert null, wenn sich der Text nicht vollständig zuordnen lässt.
 */
export function alignText(
  value: string,
  source: string,
  offset: number,
  { lineEndingAsSpace = false, decode = true }: AlignOptions = {},
): CharMap | null {
  const starts: number[] = []
  const ends: number[] = []
  let i = 0
  let j = 0
  while (i < value.length) {
    if (j >= source.length) return null
    const c = source[j]

    if (decode && c === '\\' && j + 1 < source.length && ASCII_PUNCT.test(source[j + 1]) && value[i] === source[j + 1]) {
      starts.push(offset + j)
      ends.push(offset + j + 2)
      i += 1
      j += 2
      continue
    }

    if (decode && c === '&') {
      const ref = matchCharRef(source, j)
      if (ref && value.startsWith(ref.decoded, i)) {
        for (let k = 0; k < ref.decoded.length; k++) {
          starts.push(offset + j)
          ends.push(offset + j + ref.length)
        }
        i += ref.decoded.length
        j += ref.length
        continue
      }
    }

    if (value[i] === c || (lineEndingAsSpace && value[i] === ' ' && (c === '\n' || c === '\r'))) {
      // \r\n als ein Zeichen behandeln
      const width = c === '\r' && source[j + 1] === '\n' && value[i] !== '\r' ? 2 : 1
      starts.push(offset + j)
      ends.push(offset + j + width)
      i += 1
      j += width
      continue
    }

    j += 1
  }
  return { starts, ends }
}
