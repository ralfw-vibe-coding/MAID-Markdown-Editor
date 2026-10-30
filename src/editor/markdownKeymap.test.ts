import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { continueMarkupTight } from './markdownKeymap'

/** Drückt Enter an der Stelle `|` und liefert das Ergebnis mit `|` als Cursor. */
function enter(text: string): string {
  const pos = text.indexOf('|')
  let state = EditorState.create({ doc: text.replace('|', ''), selection: { anchor: pos }, extensions: [markdown()] })
  const handled = continueMarkupTight({ state, dispatch: (tr) => (state = tr.state) })
  expect(handled).toBe(true)
  const doc = state.doc.toString()
  const head = state.selection.main.head
  return doc.slice(0, head) + '|' + doc.slice(head)
}

describe('Enter in Listen', () => {
  it('setzt eine enge Liste ohne Leerzeile fort', () => {
    expect(enter('- eins\n- leis|')).toBe('- eins\n- leis\n- |')
  })

  it('setzt auch eine lockere Liste ohne Leerzeile fort', () => {
    expect(enter('- eins\n\n- leis|')).toBe('- eins\n\n- leis\n- |')
  })

  it('beendet die Liste bei Enter auf einem leeren zweiten Punkt', () => {
    expect(enter('- leis\n- |')).toBe('- leis\n|')
  })

  it('nummeriert geordnete Listen weiter', () => {
    expect(enter('1. eins\n\n2. zwei|')).toBe('1. eins\n\n2. zwei\n3. |')
  })

  it('setzt verschachtelte Listen im Zitat fort', () => {
    expect(enter('> - a\n>\n> - b|')).toBe('> - a\n>\n> - b\n> - |')
  })
})
