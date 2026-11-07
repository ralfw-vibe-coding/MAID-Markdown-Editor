import type { Extension, Transaction } from '@codemirror/state'
import { scrollPastEnd, ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view'

/**
 * Schreibzeile: Beim Tippen und beim Bewegen mit den Pfeiltasten bleibt die
 * Cursorzeile auf derselben Höhe im Manuskript stehen (wie bei einer
 * Schreibmaschine) – der Text wandert, nicht der Blick. Damit das auch am Ende
 * des Dokuments geht, lässt sich immer über das Ende hinaus scrollen.
 *
 * `percent()` liefert die Höhe in Prozent des sichtbaren Bereichs (0 = aus).
 */
export function writingLine(percent: () => number): Extension {
  // Gescrollt wird nach dem Messen statt per scrollIntoView-Effekt: den kürzt CodeMirror
  // auf die alte Dokumentlänge, und am Dokumentende landete sonst der Zeilenanfang auf der Höhe.
  const follow = ViewPlugin.define(() => ({
    update(u: ViewUpdate) {
      const p = percent()
      if (!p || !u.transactions.some(movesCursorByKeyboard)) return
      u.view.requestMeasure({
        key: 'maid-writing-line',
        read: (view) => {
          const cursor = view.coordsAtPos(view.state.selection.main.head)
          if (!cursor) return 0
          const box = view.scrollDOM.getBoundingClientRect()
          return cursor.top - box.top - (p / 100) * view.scrollDOM.clientHeight
        },
        write: (delta, view) => {
          if (Math.abs(delta) >= 1) view.scrollDOM.scrollTop += delta
        },
      })
    },
  }))
  return [scrollPastEnd(), follow]
}

/** Tippen, Löschen, Rückgängig und Pfeiltasten – aber kein Mausklick und keine KI-Änderung. */
function movesCursorByKeyboard(tr: Transaction): boolean {
  if (tr.isUserEvent('select')) return !tr.isUserEvent('select.pointer')
  return tr.isUserEvent('input') || tr.isUserEvent('delete') || tr.isUserEvent('undo') || tr.isUserEvent('redo') || tr.isUserEvent('move')
}

/** Auf welcher Höhe (in Prozent) steht der Cursor gerade? Für „Schreibzeile hier festhalten“. */
export function cursorHeightPercent(view: EditorView): number | null {
  const coords = view.coordsAtPos(view.state.selection.main.head)
  if (!coords) return null
  const box = view.scrollDOM.getBoundingClientRect()
  const percent = Math.round(((coords.top - box.top) / view.scrollDOM.clientHeight) * 100)
  return Math.min(90, Math.max(5, percent))
}
