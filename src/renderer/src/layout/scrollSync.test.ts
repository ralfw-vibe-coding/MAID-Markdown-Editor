import { describe, expect, it } from 'vitest'
import { interpolate, monotonic } from './scrollSync'

const pairs = [
  { ey: 0, py: 0 },
  { ey: 100, py: 300 },
  { ey: 200, py: 400 },
]

describe('Zuordnung der Scrollhöhen', () => {
  it('interpoliert zwischen Stützstellen, in beide Richtungen', () => {
    expect(interpolate(pairs, 50, 'ey', 'py')).toBe(150)
    expect(interpolate(pairs, 150, 'ey', 'py')).toBe(350)
    expect(interpolate(pairs, 350, 'py', 'ey')).toBe(150)
  })

  it('setzt außerhalb mit Steigung 1 fort', () => {
    expect(interpolate(pairs, 250, 'ey', 'py')).toBe(450)
  })

  it('wirft nicht aufsteigende Stützstellen weg', () => {
    expect(monotonic([{ ey: 0, py: 0 }, { ey: 10, py: 50 }, { ey: 5, py: 60 }, { ey: 20, py: 40 }, { ey: 30, py: 80 }])).toEqual([
      { ey: 0, py: 0 },
      { ey: 10, py: 50 },
      { ey: 30, py: 80 },
    ])
  })
})
