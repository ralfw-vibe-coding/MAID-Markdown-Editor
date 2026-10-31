import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Die Spalten: Versionen, Manuskript, Druckfahne, Seitenpanel (Kommentare/Chat). */
export type PaneId = 'versions' | 'editor' | 'preview' | 'side'
export type Collapsed = Record<PaneId, boolean>

/** Breite einer weggeklappten Spalte mit senkrechtem Titel. */
export const COLLAPSED_WIDTH = 30

const KEY = 'maid.collapsed'
/** Anfangs: Versionen weggeklappt, alles andere offen. */
const DEFAULT: Collapsed = { versions: true, editor: false, preview: false, side: false }

export function loadCollapsed(): Collapsed {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    const c = { ...DEFAULT, ...stored }
    return Object.values(c).every(Boolean) ? DEFAULT : c
  } catch {
    return DEFAULT
  }
}

export function saveCollapsed(c: Collapsed) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    // ohne Speicher gilt der Zustand nur bis zum Neuladen
  }
}

/** Gemerkte Breite einer Spalte mit fester Breite (Seitenpanel, Versionen). */
function loadWidth(key: string, min: number, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key))
    return v >= min ? v : fallback
  } catch {
    return fallback
  }
}

function saveWidth(key: string, w: number) {
  try {
    localStorage.setItem(key, String(w))
  } catch {
    // ohne Speicher bleibt die Breite nur bis zum Neuladen
  }
}

/** So viel Platz bleibt für die übrigen Spalten mindestens. */
const MAIN_MIN = 320

/** Breite des Seitenpanels (KI). */
export const SIDE_DEFAULT = 360
const SIDE_MIN = 260
export const clampSide = (w: number, total: number) => Math.round(Math.max(SIDE_MIN, Math.min(w, total - MAIN_MIN)))
export const loadSideWidth = () => loadWidth('maid.sideWidth', SIDE_MIN, SIDE_DEFAULT)
export const saveSideWidth = (w: number) => saveWidth('maid.sideWidth', w)

/** Breite der Versionsspalte. */
export const VERSIONS_DEFAULT = 440
const VERSIONS_MIN = 300
export const clampVersions = (w: number, total: number) => Math.round(Math.max(VERSIONS_MIN, Math.min(w, total - MAIN_MIN)))
export const loadVersionsWidth = () => loadWidth('maid.versionsWidth', VERSIONS_MIN, VERSIONS_DEFAULT)
export const saveVersionsWidth = (w: number) => saveWidth('maid.versionsWidth', w)

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
export const cannotCollapse = (c: Collapsed, id: PaneId) =>
  id === 'editor' && !c.editor && c.preview && c.side && c.versions

/**
 * Welche Spalte füllt den Platz? Manuskript und Druckfahne teilen ihn sich;
 * sind beide weggeklappt, übernimmt das Seitenpanel, sonst die Versionen.
 */
function flexPane(c: Collapsed): 'main' | 'side' | 'versions' {
  if (!c.editor || !c.preview) return 'main'
  return !c.side ? 'side' : 'versions'
}

/** Welche Trenner sind ziehbar? Nur neben Spalten mit fester Breite bzw. zwischen Manuskript und Druckfahne. */
export function visibleSplitters(c: Collapsed) {
  const flex = flexPane(c)
  return {
    /** Versionen | Rest */
    versions: !c.versions && flex !== 'versions',
    /** Manuskript | Druckfahne */
    split: !c.editor && !c.preview,
    /** Rest | Seitenpanel */
    side: !c.side && flex !== 'side',
  }
}

/**
 * Spaltenraster: Versionen | Trenner | Manuskript | Trenner | Druckfahne | Trenner | Seitenpanel.
 * Manuskript und Druckfahne teilen sich den Platz; Versionen und Seitenpanel
 * haben eine feste, ziehbare Breite – außer eine von ihnen muss den Platz füllen.
 */
export function gridColumns(c: Collapsed, split: number, splitterWidth: number, sideWidth: number, versionsWidth: number): string {
  const strip = `${COLLAPSED_WIDTH}px`
  const show = visibleSplitters(c)
  const flex = flexPane(c)
  const fill = 'minmax(0, 1fr)'
  const versions = c.versions ? strip : flex === 'versions' ? fill : `${versionsWidth}px`
  const editor = c.editor ? strip : show.split ? `minmax(0, ${split}fr)` : fill
  const preview = c.preview ? strip : show.split ? `minmax(0, ${1 - split}fr)` : fill
  const side = c.side ? strip : flex === 'side' ? fill : `${sideWidth}px`
  const gap = (on: boolean) => `${on ? splitterWidth : 0}px`
  return [versions, gap(show.versions), editor, gap(show.split), preview, gap(show.side), side].join(' ')
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
