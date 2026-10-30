import type { AnchorStatus } from './anchors'

/** Anker, wie er in der Begleitdatei gespeichert ist. */
export type StoredAnchor = {
  from: number
  to: number
  /** Wortlaut beim Anlegen des Kommentars. */
  quote: string
  /** Wortlaut im Anker beim letzten Sichern. */
  text: string
  /** Umgebender Text beim letzten Sichern. */
  prefix: string
  suffix: string
  status: AnchorStatus
}

export type Placement = { from: number; to: number; status: AnchorStatus }

/** Mindestlänge des Kontexts, um einen geänderten Text über Präfix/Suffix einzukreisen. */
const MIN_CONTEXT = 8

function indexesOf(doc: string, needle: string): number[] {
  const out: number[] = []
  for (let i = doc.indexOf(needle); i >= 0; i = doc.indexOf(needle, i + 1)) out.push(i)
  return out
}

function commonSuffix(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

function commonPrefix(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

/**
 * Ordnet einen gespeicherten Anker einem (möglicherweise extern veränderten)
 * Dokument neu zu. Grundsatz: lieber verloren als an der falschen Stelle.
 *
 * 1. Dokument unverändert → gespeicherte Position.
 * 2. Gespeicherter Wortlaut kommt genau einmal vor → dort.
 * 3. Mehrfach → der Treffer mit dem eindeutig besten Kontext.
 * 4. Wortlaut nicht mehr vorhanden → zwischen Präfix und Suffix einkreisen (Status „geändert“).
 * 5. Sonst verloren.
 */
export function reanchor(doc: string, a: StoredAnchor, documentUnchanged: boolean): Placement {
  const lost = (): Placement => {
    const at = Math.min(a.from, doc.length)
    return { from: at, to: at, status: 'verloren' }
  }
  if (a.status === 'verloren' || a.text.length === 0) return lost()

  if (documentUnchanged && doc.slice(a.from, a.to) === a.text) {
    return { from: a.from, to: a.to, status: a.status }
  }

  const len = a.text.length
  const hits = indexesOf(doc, a.text)
  if (hits.length === 1) return { from: hits[0], to: hits[0] + len, status: a.status }
  if (hits.length > 1) {
    const scored = hits
      .map((h) => ({
        h,
        score:
          commonSuffix(a.prefix, doc.slice(Math.max(0, h - a.prefix.length), h)) +
          commonPrefix(a.suffix, doc.slice(h + len, h + len + a.suffix.length)),
      }))
      .sort((x, y) => y.score - x.score)
    if (scored[0].score > 0 && scored[0].score > scored[1].score) {
      return { from: scored[0].h, to: scored[0].h + len, status: a.status }
    }
    return lost()
  }

  // Wortlaut verändert: Bereich zwischen unverändertem Präfix und Suffix suchen.
  if (Math.max(a.prefix.length, a.suffix.length) < MIN_CONTEXT) return lost()
  const window = Math.max(3 * len, len + 200)
  const starts = a.prefix === '' ? (a.from === 0 ? [0] : []) : indexesOf(doc, a.prefix).map((i) => i + a.prefix.length)
  const candidates: { from: number; to: number }[] = []
  for (const from of starts) {
    const area = doc.slice(from, from + window + a.suffix.length)
    const s = a.suffix === '' ? (from + window >= doc.length ? doc.length - from : -1) : area.indexOf(a.suffix)
    if (s > 0) candidates.push({ from, to: from + s })
  }
  if (candidates.length === 1) return { ...candidates[0], status: 'geändert' }
  return lost()
}
