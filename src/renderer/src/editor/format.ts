import { EditorSelection, type EditorState, type StateCommand } from '@codemirror/state'
import type { FormatCommand } from '../../../shared/host'

export type { FormatCommand }

/** Wie oft steht `ch` unmittelbar vor bzw. nach einer Position? */
function runBefore(state: EditorState, pos: number, ch: string): number {
  let n = 0
  while (pos - n > 0 && state.doc.sliceString(pos - n - 1, pos - n) === ch) n++
  return n
}
function runAfter(state: EditorState, pos: number, ch: string): number {
  let n = 0
  while (pos + n < state.doc.length && state.doc.sliceString(pos + n, pos + n + 1) === ch) n++
  return n
}

/**
 * Ist [from, to) bereits von `open`/`close` umschlossen? Bei `*` und `**`
 * zählt die Länge der Sternchenfolge, damit Kursiv und Fett unterscheidbar
 * bleiben (`***x***` ist beides).
 */
function isWrapped(state: EditorState, from: number, to: number, open: string, close: string): boolean {
  if (open === '*' || open === '**') {
    const b = runBefore(state, from, '*')
    const a = runAfter(state, to, '*')
    const fits = (n: number) => (open === '*' ? n === 1 || n === 3 : n === 2 || n === 3)
    return fits(b) && fits(a)
  }
  return (
    state.doc.sliceString(Math.max(0, from - open.length), from) === open &&
    state.doc.sliceString(to, to + close.length) === close
  )
}

/**
 * Schaltet eine Inline-Auszeichnung um: Auswahl einschließen oder – wenn
 * schon ausgezeichnet – die Zeichen entfernen. Ohne Auswahl gilt das Wort am
 * Cursor; steht der Cursor nicht in einem Wort, werden die Zeichen eingefügt
 * und der Cursor dazwischen gesetzt.
 */
export const toggleInline =
  (open: string, close = open): StateCommand =>
  ({ state, dispatch }) => {
    const tr = state.changeByRange((range) => {
      let { from, to } = range
      if (from === to) {
        const word = state.wordAt(from)
        if (word) ({ from, to } = word)
      }
      if (isWrapped(state, from, to, open, close)) {
        return {
          changes: [
            { from: from - open.length, to: from },
            { from: to, to: to + close.length },
          ],
          range: EditorSelection.range(from - open.length, to - open.length),
        }
      }
      const inner = state.doc.sliceString(from, to)
      if (inner.length >= open.length + close.length && inner.startsWith(open) && inner.endsWith(close)) {
        return {
          changes: { from, to, insert: inner.slice(open.length, inner.length - close.length) },
          range: EditorSelection.range(from, to - open.length - close.length),
        }
      }
      return {
        changes: [
          { from, insert: open },
          { from: to, insert: close },
        ],
        range: from === to ? EditorSelection.cursor(from + open.length) : EditorSelection.range(from + open.length, to + open.length),
      }
    })
    dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }))
    return true
  }

const URL_LIKE = /^(https?:\/\/|mailto:|www\.)\S+$/i

/**
 * Link einfügen: Ist die Auswahl eine Adresse, wird sie zum Ziel und der
 * Cursor steht im Linktext; sonst wird die Auswahl zum Linktext und „https://“
 * ist zum Überschreiben ausgewählt.
 */
export const insertLink: StateCommand = ({ state, dispatch }) => {
  const tr = state.changeByRange(({ from, to }) => {
    const text = state.doc.sliceString(from, to)
    if (URL_LIKE.test(text)) {
      const insert = `[](${text})`
      return { changes: { from, to, insert }, range: EditorSelection.cursor(from + 1) }
    }
    const label = text || 'Linktext'
    const insert = `[${label}](https://)`
    const urlFrom = from + label.length + 3
    return {
      changes: { from, to, insert },
      range: text ? EditorSelection.range(urlFrom, urlFrom + 8) : EditorSelection.range(from + 1, from + 1 + label.length),
    }
  })
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }))
  return true
}

export const formatCommands: Record<FormatCommand, StateCommand> = {
  bold: toggleInline('**'),
  italic: toggleInline('*'),
  underline: toggleInline('<u>', '</u>'),
  strike: toggleInline('~~'),
  highlight: toggleInline('=='),
  link: insertLink,
}
