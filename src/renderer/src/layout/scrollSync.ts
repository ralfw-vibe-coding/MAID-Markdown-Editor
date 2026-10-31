import type { EditorView } from '@codemirror/view'
import type { Segment } from '../render/buildPreview'

/** Zugehörige Höhen: Stelle im Manuskript (ey) und dieselbe Stelle in der Druckfahne (py). */
export type HeightPair = { ey: number; py: number }

/**
 * Lineare Interpolation zwischen Stützstellen, die nach `from` aufsteigend
 * sortiert sind. Außerhalb wird mit Steigung 1 fortgesetzt.
 */
export function interpolate<K extends keyof HeightPair>(pairs: HeightPair[], x: number, from: K, to: Exclude<keyof HeightPair, K>): number {
  if (pairs.length === 0) return x
  if (x <= pairs[0][from]) return pairs[0][to] - (pairs[0][from] - x)
  for (let i = 1; i < pairs.length; i++) {
    const a = pairs[i - 1]
    const b = pairs[i]
    if (x <= b[from]) {
      const span = b[from] - a[from]
      return span <= 0 ? a[to] : a[to] + ((x - a[from]) / span) * (b[to] - a[to])
    }
  }
  const last = pairs[pairs.length - 1]
  return last[to] + (x - last[from])
}

/** Nur Stützstellen behalten, die in beiden Richtungen aufsteigen (sonst springt die Interpolation). */
export function monotonic(pairs: HeightPair[]): HeightPair[] {
  const out: HeightPair[] = []
  for (const p of pairs) {
    const last = out.at(-1)
    if (!last || (p.ey > last.ey && p.py > last.py)) out.push(p)
  }
  return out
}

/** Höhe (relativ zum Inhalt des Scroll-Containers) einer Dokumentposition im Manuskript. */
export function editorY(view: EditorView, pos: number): number {
  const scroller = view.scrollDOM
  const docTop = view.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop
  return docTop + view.lineBlockAt(pos).top
}

/**
 * Stützstellen aus der gerenderten Druckfahne: je Zeile der Druckfahne der
 * erste Textabschnitt mit seiner Quellposition.
 */
export function collectPairs(view: EditorView, preview: HTMLElement, scroller: HTMLElement, segments: Segment[]): HeightPair[] {
  const base = scroller.getBoundingClientRect().top - scroller.scrollTop
  const pairs: HeightPair[] = [{ ey: 0, py: 0 }]
  let lastPy = -Infinity
  for (const span of preview.querySelectorAll<HTMLElement>('[data-seg]')) {
    const py = span.getBoundingClientRect().top - base
    if (py - lastPy < 6) continue
    const seg = segments[Number(span.dataset.seg)]
    if (!seg) continue
    pairs.push({ ey: editorY(view, seg.starts[0]), py })
    lastPy = py
  }
  pairs.push({ ey: view.scrollDOM.scrollHeight, py: scroller.scrollHeight })
  return monotonic(pairs)
}
