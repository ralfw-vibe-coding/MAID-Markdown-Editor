import { describe, expect, it } from 'vitest'
import { axisTicks, clusterPoints, fitWindow, MIN_SPAN, panWindow, revealTime, toFraction, zoomWindow } from './timeWindow'

const H = 3_600_000
const D = 24 * H

describe('Zeitfenster', () => {
  it('„Alles“ zeigt erste Version bis jetzt mit Rand', () => {
    const w = fitWindow([0, 10 * D], 20 * D)
    expect(toFraction(0, w)).toBeGreaterThan(0)
    expect(toFraction(20 * D, w)).toBeLessThan(1)
  })

  it('Zoomen hält den Zeitpunkt unter der Maus fest', () => {
    const w = { start: 0, end: 100 * H }
    const z = zoomWindow(w, 0.5, 0.3, 1000 * H)
    expect(z.end - z.start).toBe(50 * H)
    expect(z.start + 0.3 * (z.end - z.start)).toBeCloseTo(30 * H)
  })

  it('Zoomen ist nach unten und oben begrenzt', () => {
    const w = { start: 0, end: 10 * 60_000 }
    expect(zoomWindow(w, 0.01, 0.5, D).end - zoomWindow(w, 0.01, 0.5, D).start).toBe(MIN_SPAN)
    expect(zoomWindow(w, 1e6, 0.5, D).end - zoomWindow(w, 1e6, 0.5, D).start).toBe(D)
  })

  it('Verschieben und Hinschieben zu einer Version', () => {
    expect(panWindow({ start: 0, end: 10 }, 0.5)).toEqual({ start: 5, end: 15 })
    expect(revealTime({ start: 0, end: 10 }, 5)).toEqual({ start: 0, end: 10 })
    expect(revealTime({ start: 0, end: 10 }, 50)).toEqual({ start: 45, end: 55 })
  })
})

describe('Bündel', () => {
  it('fasst eng liegende Punkte zusammen', () => {
    const g = clusterPoints([0, 3, 6, 40, 100, 105], 12)
    expect(g.map((x) => x.indices)).toEqual([[0, 1, 2], [3], [4, 5]])
    expect(g[0].x).toBe(3)
  })
})

describe('Achsenbeschriftung', () => {
  it('Stunden bei einem Tag, Tage bei zwei Wochen, Monate bei einem Jahr', () => {
    const start = new Date(2026, 9, 1).getTime()
    expect(axisTicks({ start, end: start + D }, 600)[1].label).toMatch(/^\d\d:\d\d$/)
    expect(axisTicks({ start, end: start + 14 * D }, 600).length).toBeGreaterThan(3)
    expect(axisTicks({ start, end: start + 14 * D }, 600)[0].label).toMatch(/^\d\d\.\d\d\.$/)
    const year = axisTicks({ start, end: start + 365 * D }, 600)
    expect(year.every((t) => !/:/.test(t.label))).toBe(true)
    expect(year.length).toBeLessThanOrEqual(10)
  })

  it('Marken liegen im Ausschnitt', () => {
    const w = { start: 1000 * H, end: 1100 * H }
    expect(axisTicks(w, 500).every((t) => t.t >= w.start && t.t <= w.end)).toBe(true)
  })
})
