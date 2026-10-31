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

/**
 * Spaltenraster für Manuskript | Trenner | Druckfahne | Seitenpanel.
 * Offene Spalten teilen sich den Platz; der Trenner gibt es nur, wenn
 * Manuskript und Druckfahne beide offen sind.
 */
export function gridColumns(c: Collapsed, split: number, splitterWidth: number, sideWidth: number): string {
  const strip = `${COLLAPSED_WIDTH}px`
  const both = !c.editor && !c.preview
  const editor = c.editor ? strip : both ? `minmax(0, ${split}fr)` : 'minmax(0, 1fr)'
  const preview = c.preview ? strip : both ? `minmax(0, ${1 - split}fr)` : 'minmax(0, 1fr)'
  const side = c.side ? strip : c.editor && c.preview ? 'minmax(0, 1fr)' : `${sideWidth}px`
  return `${editor} ${both ? splitterWidth : 0}px ${preview} ${side}`
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
