import { describe, expect, it } from 'vitest'
import { buildPrompt, parseAnswer, SYSTEM_PROMPT } from './lektor'
import { forDocument, isPlainTextPath } from './plainText'
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

  it('Fassung auf Wunsch, auch ohne Änderung', () => {
    expect(parseAnswer({ reply: 'Halte fest.', edit: false, oldText: '', newText: '', fassung: 'Erster Entwurf komplett' }).fassung).toBe('Erster Entwurf komplett')
    expect(parseAnswer({ reply: 'ok', edit: false, oldText: '', newText: '' }).fassung).toBeNull()
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

  it('oldText an der Marke gilt als Änderung an der Stelle, sonst als „an anderer Stelle“', () => {
    expect(planEdit(doc, end, 'Letzter Satz.', 'Schlusssatz.')).toEqual({ from: 13, to: 26, insert: 'Schlusssatz.' })
    expect(planEdit(doc, end, 'Erster Satz.', 'x')).toMatchObject({ from: 0, elsewhere: true })
  })

  it('Leerraum zwischen Ausschnitt und Marke ist erlaubt (Marke hinter dem letzten Zeilenumbruch)', () => {
    const d = 'Erster Satz.\n'
    const p = { from: d.length, to: d.length, point: true }
    expect(planEdit(d, p, 'Erster Satz.', 'Erster Satz. Zweiter Satz.')).toEqual({ from: 0, to: 12, insert: 'Erster Satz. Zweiter Satz.' })
    expect(planEdit('A.\n\nB.', { from: 3, to: 3, point: true }, 'B.', 'x')).toMatchObject({ from: 4 })
  })
})

describe('Änderung an anderer Stelle', () => {
  const doc = '## 1. Leitidee\n\n**MAID ist ein Editor.**\n\n## 2. Prinzipien\n\n1. Markdown ist maßgeblich.'
  const anchor = { from: doc.indexOf('Markdown'), to: doc.indexOf('Markdown') + 8 }

  it('eindeutiger Text woanders: wird dort geändert und als „elsewhere“ markiert', () => {
    const plan = planEdit(doc, anchor, '**MAID ist ein Editor.**', '**MAID ist ein Editor.** Markdown ist Klartext mit Zeichen.')
    expect(plan).toMatchObject({ from: doc.indexOf('**MAID'), elsewhere: true })
  })

  it('Text an der Stelle hat Vorrang vor gleichem Text woanders', () => {
    const d = 'Markdown hier. Und Markdown dort.'
    const plan = planEdit(d, { from: 19, to: 27 }, 'Markdown', 'MD')
    expect(plan).toEqual({ from: 19, to: 27, insert: 'MD' })
  })

  it('mehrdeutiger Text woanders: verweigert mit Anzahl', () => {
    const d = 'Ein Wort. Ein Wort. Kommentiert.'
    const r = planEdit(d, { from: d.indexOf('Kommentiert'), to: d.length - 1 }, 'Ein Wort.', 'x')
    expect(r).toHaveProperty('error')
    expect((r as { error: string }).error).toContain('2-mal')
  })

  it('Text gar nicht vorhanden: eigene Meldung', () => {
    expect((planEdit(doc, anchor, 'gibt es nicht', 'x') as { error: string }).error).toContain('kommt im Dokument nicht vor')
  })
})

describe('Textmodus (.txt)', () => {
  it('erkennt Textdateien an der Endung', () => {
    expect(isPlainTextPath('/a/Notizen.txt')).toBe(true)
    expect(isPlainTextPath('/a/NOTIZEN.TXT')).toBe(true)
    expect(isPlainTextPath('/a/text.md')).toBe(false)
    expect(isPlainTextPath(null)).toBe(false)
  })

  it('sagt Claude nur bei reinem Text, dass es kein Markdown ist', () => {
    expect(forDocument(SYSTEM_PROMPT, false)).toBe(SYSTEM_PROMPT)
    expect(forDocument(SYSTEM_PROMPT, true)).toContain('reiner Text')
  })
})
