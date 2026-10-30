import { describe, expect, it } from 'vitest'
import { buildPreview } from './buildPreview'
import { corpus } from '../testing/corpus'

/** Prüft, ob `src` eine gültige Quelldarstellung des gerenderten Zeichens `ch` ist. */
function represents(src: string, ch: string): boolean {
  if (src === ch) return true
  if (src === '\\' + ch) return true
  if (ch === ' ' && (src === '\n' || src === '\r\n')) return true
  if (src.startsWith('&') && src.endsWith(';')) {
    const el = document.createElement('textarea')
    el.innerHTML = src
    return el.value.includes(ch)
  }
  return false
}

describe('buildPreview – zeichengenaue Quellzuordnung', () => {
  for (const [name, md] of Object.entries(corpus)) {
    it(`ordnet jedes sichtbare Zeichen zu: ${name}`, () => {
      const { segments, unmapped } = buildPreview(md)
      expect(unmapped).toEqual([])
      expect(segments.length).toBeGreaterThan(0)
      for (const seg of segments) {
        expect(seg.starts).toHaveLength(seg.text.length)
        for (let i = 0; i < seg.text.length; i++) {
          const src = md.slice(seg.starts[i], seg.ends[i])
          if (!represents(src, seg.text[i])) {
            throw new Error(`Segment ${seg.id} Zeichen ${i} ${JSON.stringify(seg.text[i])} ↔ Quelle ${JSON.stringify(src)}`)
          }
          if (i > 0) expect(seg.starts[i]).toBeGreaterThanOrEqual(seg.starts[i - 1])
        }
      }
    })
  }

  it('Segmente stehen in Quelltext-Reihenfolge', () => {
    for (const md of Object.values(corpus)) {
      const { segments } = buildPreview(md)
      for (let k = 1; k < segments.length; k++) {
        expect(segments[k].starts[0]).toBeGreaterThanOrEqual(segments[k - 1].ends.at(-1)!)
      }
    }
  })
})
