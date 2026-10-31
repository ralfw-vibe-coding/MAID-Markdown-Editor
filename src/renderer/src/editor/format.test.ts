import { describe, expect, it } from 'vitest'
import { EditorState, EditorSelection } from '@codemirror/state'
import { formatCommands, type FormatCommand } from './format'

/** Text mit Auswahl als «…» bzw. Cursor als |; liefert das Ergebnis in derselben Schreibweise. */
function apply(cmd: FormatCommand, input: string): string {
  const from = input.includes('|') ? input.indexOf('|') : input.indexOf('«')
  const to = input.includes('|') ? from : input.indexOf('»') - 1
  const doc = input.replace(/[|«»]/g, '')
  let state = EditorState.create({ doc, selection: EditorSelection.range(from, to) })
  formatCommands[cmd]({ state, dispatch: (tr) => (state = tr.state) })
  const { from: a, to: b } = state.selection.main
  const out = state.doc.toString()
  return a === b ? out.slice(0, a) + '|' + out.slice(a) : out.slice(0, a) + '«' + out.slice(a, b) + '»' + out.slice(b)
}

describe('Formatierungen', () => {
  it('Fett: einschließen und wieder entfernen', () => {
    expect(apply('bold', 'ein «Wort» hier')).toBe('ein **«Wort»** hier')
    expect(apply('bold', 'ein **«Wort»** hier')).toBe('ein «Wort» hier')
  })

  it('ohne Auswahl gilt das Wort am Cursor', () => {
    expect(apply('italic', 'ein Wo|rt hier')).toBe('ein *«Wort»* hier')
  })

  it('ohne Wort: Zeichen einfügen, Cursor dazwischen', () => {
    expect(apply('strike', 'Ende. |')).toBe('Ende. ~~|~~')
  })

  it('Kursiv und Fett lassen sich unterscheiden', () => {
    expect(apply('italic', '**«Wort»**')).toBe('***«Wort»***')
    expect(apply('bold', '***«Wort»***')).toBe('*«Wort»*')
    expect(apply('italic', '***«Wort»***')).toBe('**«Wort»**')
  })

  it('Auswahl samt Auszeichnung wird ebenfalls entfernt', () => {
    expect(apply('highlight', 'ein «==Wort==» hier')).toBe('ein «Wort» hier')
  })

  it('Unterstrichen und Hervorgehoben', () => {
    expect(apply('underline', '«Wort»')).toBe('<u>«Wort»</u>')
    expect(apply('highlight', '«zwei Wörter»')).toBe('==«zwei Wörter»==')
  })

  it('Link: Auswahl wird Linktext, „https://“ ist ausgewählt', () => {
    expect(apply('link', 'siehe «Doku» dort')).toBe('siehe [Doku](«https://») dort')
  })

  it('Link: ausgewählte Adresse wird Ziel', () => {
    expect(apply('link', '«https://example.com»')).toBe('[|](https://example.com)')
  })
})
