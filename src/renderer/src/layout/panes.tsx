import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Die drei Spalten: Manuskript, Druckfahne, Seitenpanel (Kommentare/Chat). */
export type PaneId = 'editor' | 'preview' | 'side'
export type Collapsed = Record<PaneId, boolean>

/** Breite einer weggeklappten Spalte mit senkrechtem Titel. */
export const COLLAPSED_WIDTH = 30

const KEY = 'maid.collapsed'
const NONE: Collapsed = { editor: false, preview: false, side: false }

export function loadCollapsed(): Collapsed {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    const c = { ...NONE, ...stored }
    return Object.values(c).every(Boolean) ? NONE : c
  } catch {
    return NONE
  }
}

export function saveCollapsed(c: Collapsed) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    // ohne Speicher gilt der Zustand nur bis zum Neuladen
  }
}

/** Breite des Seitenpanels (KI): Vorgabe, Grenzen, gemerkter Wert. */
export const SIDE_DEFAULT = 360
const SIDE_MIN = 260
/** So viel Platz bleibt für Manuskript und Druckfahne mindestens. */
const MAIN_MIN = 320
const SIDE_KEY = 'maid.sideWidth'

export const clampSide = (w: number, total: number) => Math.round(Math.max(SIDE_MIN, Math.min(w, total - MAIN_MIN)))

export function loadSideWidth(): number {
  try {
    const v = Number(localStorage.getItem(SIDE_KEY))
    return v >= SIDE_MIN ? v : SIDE_DEFAULT
  } catch {
    return SIDE_DEFAULT
  }
}

export function saveSideWidth(w: number) {
  try {
    localStorage.setItem(SIDE_KEY, String(w))
  } catch {
    // ohne Speicher bleibt die Breite nur bis zum Neuladen
  }
}

/** Klappt eine Spalte um. Wäre danach keine mehr offen, geht das Manuskript auf. */
export function toggleCollapsed(c: Collapsed, id: PaneId): Collapsed {
  const next = { ...c, [id]: !c[id] }
  return Object.values(next).every(Boolean) ? { ...next, editor: false } : next
}

/**
 * Lässt sich die Spalte nicht wegklappen? Nur das Manuskript, wenn es als
 * einzige offen ist – jede andere letzte Spalte macht beim Wegklappen dem
 * Manuskript Platz.
 */
export const cannotCollapse = (c: Collapsed, id: PaneId) => id === 'editor' && !c.editor && c.preview && c.side

/** Welche Trenner sind ziehbar? Nur zwischen zwei offenen Bereichen mit fester Aufteilung. */
export function visibleSplitters(c: Collapsed) {
  return {
    /** Manuskript | Druckfahne */
    split: !c.editor && !c.preview,
    /** (Manuskript/Druckfahne) | Seitenpanel – fehlt, wenn das Seitenpanel den ganzen Platz hat. */
    side: !c.side && !(c.editor && c.preview),
  }
}

/**
 * Spaltenraster für Manuskript | Trenner | Druckfahne | Trenner | Seitenpanel.
 * Offene Spalten teilen sich den Platz; das Seitenpanel hat eine feste,
 * ziehbare Breite – außer es ist als einzige Spalte offen.
 */
export function gridColumns(c: Collapsed, split: number, splitterWidth: number, sideWidth: number): string {
  const strip = `${COLLAPSED_WIDTH}px`
  const show = visibleSplitters(c)
  const editor = c.editor ? strip : show.split ? `minmax(0, ${split}fr)` : 'minmax(0, 1fr)'
  const preview = c.preview ? strip : show.split ? `minmax(0, ${1 - split}fr)` : 'minmax(0, 1fr)'
  const side = c.side ? strip : c.editor && c.preview ? 'minmax(0, 1fr)' : `${sideWidth}px`
  return `${editor} ${show.split ? splitterWidth : 0}px ${preview} ${show.side ? splitterWidth : 0}px ${side}`
}

/** Chevron im Kopf einer offenen Spalte – überall „>“, damit alle Spalten gleich aussehen. */
export function CollapseButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      className="icon pane-toggle"
      title={disabled ? 'Das Manuskript bleibt offen, wenn alles andere zu ist' : 'Spalte wegklappen'}
      aria-label="Spalte wegklappen"
      disabled={disabled}
      onClick={onClick}
    >
      <ChevronRight size={15} />
    </button>
  )
}

/** Weggeklappte Spalte: schmaler Streifen mit „<“ und senkrechtem Titel; Klick klappt auf. */
export function CollapsedStrip({ title, onExpand }: { title: string; onExpand: () => void }) {
  return (
    <button className="pane-strip" title={`${title} aufklappen`} aria-label={`${title} aufklappen`} onClick={onExpand}>
      <ChevronLeft size={15} />
      <span className="pane-strip-title">{title}</span>
    </button>
  )
}
