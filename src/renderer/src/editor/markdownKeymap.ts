import { EditorSelection, Prec, type StateCommand, type Transaction } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { deleteMarkupBackward, insertNewlineContinueMarkupCommand } from '@codemirror/lang-markdown'

const continueMarkup = insertNewlineContinueMarkupCommand({ nonTightLists: false })

// Zeilenumbruch, Leerzeile (ggf. mit Zitatzeichen), Zeilenumbruch
const LEADING_BLANK_LINE = /^(\r?\n)[ \t>]*(?=\r?\n)/

/**
 * Enter in Listen und Zitaten: setzt das Markup fort wie CodeMirror, legt
 * aber immer direkt den nächsten Punkt an. CodeMirror fügt sonst in
 * „lockeren“ Listen (mit Leerzeilen zwischen den Punkten) eine Leerzeile ein.
 * Enter auf einem leeren Punkt beendet die Liste.
 */
export const continueMarkupTight: StateCommand = ({ state, dispatch }) => {
  let tr: Transaction | null = null
  if (!continueMarkup({ state, dispatch: (t) => (tr = t) })) return false
  const original = tr as Transaction | null
  if (!original) return false

  const specs: { from: number; to: number; insert: string }[] = []
  const removed: { at: number; length: number }[] = []
  original.changes.iterChanges((fromA, toA, fromB, _toB, inserted) => {
    let text = inserted.toString()
    const m = LEADING_BLANK_LINE.exec(text)
    if (m) {
      const length = m[0].length
      removed.push({ at: fromB, length })
      text = text.slice(length)
    }
    specs.push({ from: fromA, to: toA, insert: text })
  })
  if (removed.length === 0) {
    dispatch(original)
    return true
  }

  const shift = (pos: number) => pos - removed.filter((r) => r.at < pos).reduce((sum, r) => sum + r.length, 0)
  const selection = EditorSelection.create(
    original.newSelection.ranges.map((r) => EditorSelection.range(shift(r.anchor), shift(r.head))),
    original.newSelection.mainIndex,
  )
  dispatch(state.update({ changes: specs, selection, scrollIntoView: true, userEvent: 'input' }))
  return true
}

export const markdownKeymap = Prec.high(
  keymap.of([
    { key: 'Enter', run: continueMarkupTight },
    { key: 'Backspace', run: deleteMarkupBackward },
  ]),
)
