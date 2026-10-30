import type { Segment } from '../render/buildPreview'

export type SourceRange = { from: number; to: number }

type SegNode = { seg: Segment; text: Text }

/** Alle Segment-Textknoten der Preview in Dokumentreihenfolge. */
function segmentNodes(root: HTMLElement, segments: Segment[]): SegNode[] {
  const out: SegNode[] = []
  for (const span of root.querySelectorAll<HTMLElement>('[data-seg]')) {
    const text = span.firstChild
    if (text instanceof Text) out.push({ seg: segments[Number(span.dataset.seg)], text })
  }
  return out
}

/**
 * Übersetzt eine Browser-Auswahl in der Preview in einen Bereich des
 * Markdown-Quelltexts. Liefert null, wenn die Auswahl keinen zuordenbaren
 * Text enthält.
 */
export function domRangeToSource(range: Range, root: HTMLElement, segments: Segment[]): SourceRange | null {
  let from: number | null = null
  let to: number | null = null
  for (const { seg, text } of segmentNodes(root, segments)) {
    if (!range.intersectsNode(text)) continue
    const a = range.startContainer === text ? range.startOffset : 0
    const b = range.endContainer === text ? range.endOffset : seg.text.length
    if (a >= b) continue
    if (from === null) from = seg.starts[a]
    to = seg.ends[b - 1]
  }
  return from === null || to === null ? null : { from, to }
}

/**
 * Umkehrung: DOM-Range für einen Quelltextbereich, um ihn in der Preview
 * hervorzuheben. Zeichen gelten als enthalten, wenn ihre Quelldarstellung
 * den Bereich überlappt.
 */
export function sourceToDomRange(src: SourceRange, root: HTMLElement, segments: Segment[]): Range | null {
  if (src.from >= src.to) return null
  let start: { text: Text; i: number } | null = null
  let end: { text: Text; i: number } | null = null
  for (const { seg, text } of segmentNodes(root, segments)) {
    for (let i = 0; i < seg.text.length; i++) {
      if (seg.starts[i] < src.to && seg.ends[i] > src.from) {
        if (!start) start = { text, i }
        end = { text, i: i + 1 }
      }
    }
  }
  if (!start || !end) return null
  const range = root.ownerDocument.createRange()
  range.setStart(start.text, start.i)
  range.setEnd(end.text, end.i)
  return range
}
