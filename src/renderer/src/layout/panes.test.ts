import { describe, expect, it } from 'vitest'
import { cannotCollapse, clampSide, gridColumns, toggleCollapsed, type Collapsed } from './panes'

const open: Collapsed = { editor: false, preview: false, side: false }

describe('Wegklappbare Spalten', () => {
  it('alle offen: Aufteilung nach Trenner, Seitenpanel fest', () => {
    expect(gridColumns(open, 0.4, 5, 360)).toBe('minmax(0, 0.4fr) 5px minmax(0, 0.6fr) 5px 360px')
  })

  it('Manuskript zu: Druckfahne nimmt den Platz, kein Trenner', () => {
    expect(gridColumns({ ...open, editor: true }, 0.4, 5, 420)).toBe('30px 0px minmax(0, 1fr) 5px 420px')
  })

  it('Manuskript und Druckfahne zu: Seitenpanel nimmt den Platz', () => {
    expect(gridColumns({ editor: true, preview: true, side: false }, 0.5, 5, 360)).toBe('30px 0px 30px 0px minmax(0, 1fr)')
  })

  it('wird die letzte offene Spalte weggeklappt, geht das Manuskript auf', () => {
    const nurSeite = { editor: true, preview: true, side: false }
    expect(cannotCollapse(nurSeite, 'side')).toBe(false)
    expect(toggleCollapsed(nurSeite, 'side')).toEqual({ editor: false, preview: true, side: true })
    const nurDruckfahne = { editor: true, preview: false, side: true }
    expect(toggleCollapsed(nurDruckfahne, 'preview')).toEqual({ editor: false, preview: true, side: true })
  })

  it('nur das Manuskript als letzte offene Spalte lässt sich nicht wegklappen', () => {
    const nurManuskript = { editor: false, preview: true, side: true }
    expect(cannotCollapse(nurManuskript, 'editor')).toBe(true)
    expect(toggleCollapsed(nurManuskript, 'editor')).toEqual(nurManuskript)
    expect(cannotCollapse(open, 'editor')).toBe(false)
  })

  it('Seitenpanel weggeklappt: kein zweiter Trenner', () => {
    expect(gridColumns({ ...open, side: true }, 0.5, 5, 360)).toBe('minmax(0, 0.5fr) 5px minmax(0, 0.5fr) 0px 30px')
  })

  it('Breite des Seitenpanels wird begrenzt', () => {
    expect(clampSide(100, 1400)).toBe(260)
    expect(clampSide(1300, 1400)).toBe(1080)
    expect(clampSide(500, 1400)).toBe(500)
  })
})
