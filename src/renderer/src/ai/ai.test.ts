import { describe, expect, it } from 'vitest'
import { buildPrompt, parseAnswer } from './lektor'
import { minimalChange, planEdit } from './planEdit'
import { diffWords } from '../thread/diffWords'
import { message } from '../thread/thread'

describe('Prompt für den Lektor', () => {
  const doc = 'Das ist **absolut sicher** richtig.'
  const from = doc.indexOf('absolut')
  const to = from + 'absolut sicher'.length

  it('markiert die Stelle im Dokument und enthält den Verlauf', () => {
    const p = buildPrompt({ doc, from, to, messages: [message({ kind: 'user', text: 'Zu absolut.' })], mode: 'discuss' })
    expect(p).toContain('Das ist **⟦absolut sicher⟧** richtig.')
    expect(p).toContain('Autor: Zu absolut.')
    expect(p).toContain('ausdrücklich verlangt')
  })

  it('„Umsetzen“ fordert eine Änderung an', () => {
    const p = buildPrompt({ doc, from, to, messages: [], mode: 'execute' })
    expect(p).toContain('„Umsetzen“ gedrückt')
  })

  it('entfernt Markierungszeichen aus der Antwort', () => {
    const a = parseAnswer({ reply: 'ok', edit: true, oldText: '⟦absolut sicher⟧', newText: 'sehr wahrscheinlich' })
    expect(a.edit).toEqual({ oldText: 'absolut sicher', newText: 'sehr wahrscheinlich' })
  })

  it('ohne Auftrag keine Änderung', () => {
    expect(parseAnswer({ reply: 'Vorschlag: „sehr wahrscheinlich“', edit: false, oldText: '', newText: '' }).edit).toBeNull()
  })
})

describe('Änderung planen', () => {
  const doc = 'Erstens: das Wort hier. Zweitens: das Wort dort.'
  const anchorAt = (q: string, nth = 0) => {
    let i = -1
    for (let k = 0; k <= nth; k++) i = doc.indexOf(q, i + 1)
    return { from: i, to: i + q.length }
  }

  it('ersetzt den Text am Anker, nicht ein gleiches Vorkommen woanders', () => {
    expect(planEdit(doc, anchorAt('Wort', 1), 'das Wort dort', 'der Begriff dort')).toEqual({
      from: doc.lastIndexOf('das Wort dort'),
      to: doc.lastIndexOf('das Wort dort') + 13,
      insert: 'der Begriff dort',
    })
  })

  it('leeres oldText meint genau den Anker', () => {
    const a = anchorAt('Wort')
    expect(planEdit(doc, a, '', 'Begriff')).toEqual({ ...a, insert: 'Begriff' })
  })

  it('verweigert, wenn der Text inzwischen geändert wurde', () => {
    expect(planEdit(doc, anchorAt('Wort'), 'das Wörtchen hier', 'x')).toHaveProperty('error')
  })

  it('verweigert bei verlorenem Anker', () => {
    expect(planEdit(doc, { from: 5, to: 5 }, 'das', 'x')).toHaveProperty('error')
  })

  it('verkleinert die Ersetzung auf den veränderten Teil', () => {
    const plan = planEdit(doc, anchorAt('das Wort hier'), 'das Wort hier', 'das Wort da')
    expect(minimalChange(doc, plan as never)).toMatchObject({ insert: 'da' })
  })
})

describe('Wort-Diff', () => {
  it('zeigt gelöschte und eingefügte Wörter', () => {
    expect(diffWords('Das ist absolut sicher.', 'Das ist sehr wahrscheinlich.')).toEqual([
      { type: 'same', text: 'Das ist ' },
      { type: 'del', text: 'absolut sicher' },
      { type: 'ins', text: 'sehr wahrscheinlich' },
      { type: 'same', text: '.' },
    ])
  })

  it('unveränderte Wörter zwischen Änderungen bleiben stehen', () => {
    expect(diffWords('ein großes rotes Haus', 'ein kleines rotes Auto')).toEqual([
      { type: 'same', text: 'ein ' },
      { type: 'del', text: 'großes' },
      { type: 'ins', text: 'kleines' },
      { type: 'same', text: ' rotes ' },
      { type: 'del', text: 'Haus' },
      { type: 'ins', text: 'Auto' },
    ])
  })
})

describe('Einfügemarke', () => {
  const doc = 'Erster Satz. Letzter Satz.'
  const end = { from: doc.length, to: doc.length, point: true }

  it('Prompt zeigt die Cursorposition als ⟦⟧', () => {
    const p = buildPrompt({ doc, ...end, messages: [], mode: 'discuss' })
    expect(p).toContain('Letzter Satz.⟦⟧')
    expect(p).toContain('Einfügemarke')
  })

  it('leeres oldText fügt an der Marke ein', () => {
    expect(planEdit(doc, end, '', ' Neu.')).toEqual({ from: doc.length, to: doc.length, insert: ' Neu.' })
  })

  it('oldText muss an die Marke grenzen', () => {
    expect(planEdit(doc, end, 'Letzter Satz.', 'Schlusssatz.')).toMatchObject({ insert: 'Schlusssatz.' })
    expect(planEdit(doc, end, 'Erster Satz.', 'x')).toHaveProperty('error')
  })

  it('Leerraum zwischen Ausschnitt und Marke ist erlaubt (Marke hinter dem letzten Zeilenumbruch)', () => {
    const d = 'Erster Satz.\n'
    const p = { from: d.length, to: d.length, point: true }
    expect(planEdit(d, p, 'Erster Satz.', 'Erster Satz. Zweiter Satz.')).toEqual({ from: 0, to: 12, insert: 'Erster Satz. Zweiter Satz.' })
    expect(planEdit('A.\n\nB.', { from: 3, to: 3, point: true }, 'B.', 'x')).toMatchObject({ from: 4 })
  })
})
