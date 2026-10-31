import { describe, expect, it } from 'vitest'
import { timelinePositions } from './timeline'

const h = 3_600_000

describe('Zeitstrahl', () => {
  it('maßstäblich zwischen erster Version und jetzt', () => {
    const p = timelinePositions([0, 5 * h], 10 * h)
    expect(p[0]).toBe(0)
    expect(p[1]).toBeCloseTo(0.46)
  })

  it('kurz hintereinander gesicherte Versionen bekommen Abstand', () => {
    const p = timelinePositions([0, 1000, 2000], 100 * h)
    expect(p[1] - p[0]).toBeCloseTo(0.04)
    expect(p[2] - p[1]).toBeCloseTo(0.04)
  })

  it('bleibt links von „jetzt“, auch wenn alles gerade eben war', () => {
    const p = timelinePositions([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25], 26)
    expect(Math.max(...p)).toBeLessThanOrEqual(0.92 + 1e-9)
    expect(p).toEqual([...p].sort((a, b) => a - b))
  })

  it('keine Versionen, keine Punkte', () => {
    expect(timelinePositions([], 0)).toEqual([])
  })
})
