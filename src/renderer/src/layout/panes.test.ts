import { describe, expect, it } from 'vitest'
import { cannotCollapse, clampSide, gridColumns, toggleCollapsed, type Collapsed } from './panes'

const open: Collapsed = { versions: true, editor: false, preview: false, side: false }

describe('Wegklappbare Spalten', () => {
  it('Standard: Versionen als Streifen, Aufteilung nach Trenner, Seitenpanel fest', () => {
    expect(gridColumns(open, 0.4, 5, 360, 440)).toBe('30px 0px minmax(0, 0.4fr) 5px minmax(0, 0.6fr) 5px 360px')
  })

  it('Versionen offen: feste Breite mit eigenem Trenner', () => {
    expect(gridColumns({ ...open, versions: false }, 0.5, 5, 360, 440)).toBe('440px 5px minmax(0, 0.5fr) 5px minmax(0, 0.5fr) 5px 360px')
  })

  it('Manuskript zu: Druckfahne nimmt den Platz, kein Trenner dazwischen', () => {
    expect(gridColumns({ ...open, editor: true }, 0.4, 5, 420, 440)).toBe('30px 0px 30px 0px minmax(0, 1fr) 5px 420px')
  })

  it('Manuskript und Druckfahne zu: Seitenpanel nimmt den Platz', () => {
    expect(gridColumns({ versions: true, editor: true, preview: true, side: false }, 0.5, 5, 360, 440)).toBe('30px 0px 30px 0px 30px 0px minmax(0, 1fr)')
  })

  it('nur Versionen offen: Versionen nehmen den Platz', () => {
    expect(gridColumns({ versions: false, editor: true, preview: true, side: true }, 0.5, 5, 360, 440)).toBe('minmax(0, 1fr) 0px 30px 0px 30px 0px 30px')
  })

  it('wird die letzte offene Spalte weggeklappt, geht das Manuskript auf', () => {
    const nurSeite = { versions: true, editor: true, preview: true, side: false }
    expect(cannotCollapse(nurSeite, 'side')).toBe(false)
    expect(toggleCollapsed(nurSeite, 'side')).toEqual({ versions: true, editor: false, preview: true, side: true })
  })

  it('nur das Manuskript als letzte offene Spalte lässt sich nicht wegklappen', () => {
    const nurManuskript = { versions: true, editor: false, preview: true, side: true }
    expect(cannotCollapse(nurManuskript, 'editor')).toBe(true)
    expect(toggleCollapsed(nurManuskript, 'editor')).toEqual(nurManuskript)
    expect(cannotCollapse(open, 'editor')).toBe(false)
  })

  it('Breite des Seitenpanels wird begrenzt', () => {
    expect(clampSide(100, 1400)).toBe(260)
    expect(clampSide(1300, 1400)).toBe(1080)
    expect(clampSide(500, 1400)).toBe(500)
  })
})
