import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { history, redo, undo } from '@codemirror/commands'
import { addAnchor, anchorField, anchorHistory, createAnchor, placeAnchor } from './anchors'

function setup(doc: string, quote: string) {
  let state = EditorState.create({ doc, extensions: [anchorField] })
  const from = doc.indexOf(quote)
  state = state.update({ effects: addAnchor.of(createAnchor(state.doc, from, from + quote.length)) }).state
  return state
}

const anchorOf = (state: EditorState) => state.field(anchorField)[0]
const textOf = (state: EditorState) => {
  const a = anchorOf(state)
  return state.doc.sliceString(a.from, a.to)
}

describe('Anker-Nachführung bei Editor-Änderungen', () => {
  it('Einfügen vor dem Anker verschiebt ihn', () => {
    let s = setup('Ein **fettes** Wort.', 'Wort')
    s = s.update({ changes: { from: 0, insert: 'Grüße 😀! ' } }).state
    expect(textOf(s)).toBe('Wort')
    expect(anchorOf(s).status).toBe('ok')
  })

  it('Löschen vor dem Anker verschiebt ihn', () => {
    let s = setup('Ein **fettes** Wort.', 'Wort')
    s = s.update({ changes: { from: 0, to: 4 } }).state
    expect(textOf(s)).toBe('Wort')
  })

  it('Änderung nach dem Anker lässt ihn unverändert', () => {
    let s = setup('Ein Wort hier.', 'Wort')
    s = s.update({ changes: { from: 9, insert: 'und dort ' } }).state
    expect(anchorOf(s)).toMatchObject({ from: 4, to: 8, status: 'ok' })
  })

  it('Einfügen direkt am Rand erweitert den Anker nicht', () => {
    let s = setup('Ein Wort hier.', 'Wort')
    s = s.update({ changes: [{ from: 4, insert: '«' }, { from: 8, insert: '»' }] }).state
    expect(textOf(s)).toBe('Wort')
  })

  it('Bearbeitung im Anker führt nach und markiert ihn als geändert', () => {
    let s = setup('Ein langes Wort hier.', 'langes Wort')
    s = s.update({ changes: { from: 4, to: 10, insert: 'kurzes' } }).state
    expect(textOf(s)).toBe('kurzes Wort')
    expect(anchorOf(s).status).toBe('geändert')
  })

  it('vollständige Löschung macht den Anker verloren, Thread bleibt erhalten', () => {
    let s = setup('Ein Wort hier.', 'Wort ')
    s = s.update({ changes: { from: 4, to: 9 } }).state
    expect(anchorOf(s).status).toBe('verloren')
    expect(anchorOf(s).quote).toBe('Wort ')
  })
})

describe('Anker und Undo/Redo', () => {
  function withHistory(doc: string, quote: string) {
    let state = EditorState.create({ doc, extensions: [anchorField, history(), anchorHistory] })
    const from = doc.indexOf(quote)
    state = state.update({ effects: addAnchor.of(createAnchor(state.doc, from, from + quote.length)) }).state
    return state
  }
  const run = (state: EditorState, cmd: typeof undo) => {
    let next = state
    cmd({ state, dispatch: (tr) => (next = tr.state) })
    return next
  }

  it('Undo nach Löschen der Stelle stellt den Anker wieder her', () => {
    let s = withHistory('Ein Wort hier.', 'Wort')
    s = s.update({ changes: { from: 4, to: 8 } }).state
    expect(anchorOf(s).status).toBe('verloren')
    s = run(s, undo)
    expect(anchorOf(s)).toMatchObject({ from: 4, to: 8, status: 'ok' })
  })

  it('ersetzte Stelle: Anker auf Ersatztext, Undo und Redo setzen ihn zurück bzw. wieder', () => {
    let s = withHistory('Das ist absolut sicher richtig.', 'absolut sicher')
    const id = anchorOf(s).id
    s = s.update({
      changes: { from: 8, to: 22, insert: 'sehr wahrscheinlich' },
      effects: placeAnchor.of({ id, from: 8, to: 27, quote: 'sehr wahrscheinlich', status: 'ok' }),
    }).state
    expect(textOf(s)).toBe('sehr wahrscheinlich')
    s = run(s, undo)
    expect(textOf(s)).toBe('absolut sicher')
    expect(anchorOf(s).status).toBe('ok')
    s = run(s, redo)
    expect(textOf(s)).toBe('sehr wahrscheinlich')
    expect(anchorOf(s).status).toBe('ok')
  })
})

describe('Einfügemarken', () => {
  function atEnd(doc: string) {
    let state = EditorState.create({ doc, extensions: [anchorField, history(), anchorHistory] })
    state = state.update({ effects: addAnchor.of(createAnchor(state.doc, doc.length, doc.length)) }).state
    return state
  }

  it('Anker ohne Auswahl wird Einfügemarke und geht nicht verloren', () => {
    let s = atEnd('Ende.')
    expect(anchorOf(s)).toMatchObject({ point: true, from: 5, to: 5, status: 'ok' })
    s = s.update({ changes: { from: 0, to: 5 } }).state
    expect(anchorOf(s)).toMatchObject({ point: true, from: 0, status: 'ok' })
  })

  it('an der Marke Getipptes steht hinter der Marke', () => {
    let s = atEnd('Ende.')
    s = s.update({ changes: { from: 5, insert: ' Weiter.' } }).state
    expect(anchorOf(s)).toMatchObject({ from: 5, to: 5 })
  })

  it('KI-Einfügung macht aus der Marke einen Bereich, Undo wieder eine Marke', () => {
    let s = atEnd('Ende.')
    const id = anchorOf(s).id
    s = s.update({
      changes: { from: 5, insert: ' Neuer Satz.' },
      effects: placeAnchor.of({ id, from: 5, to: 17, quote: ' Neuer Satz.', status: 'ok' }),
    }).state
    expect(anchorOf(s).point).toBeUndefined()
    expect(textOf(s)).toBe(' Neuer Satz.')
    s = run(s, undo)
    expect(anchorOf(s)).toMatchObject({ point: true, from: 5, to: 5 })
  })

  const run = (state: EditorState, cmd: typeof undo) => {
    let next = state
    cmd({ state, dispatch: (tr) => (next = tr.state) })
    return next
  }
})
