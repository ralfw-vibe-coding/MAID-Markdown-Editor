import { describe, expect, it } from 'vitest'
import { buildChatPrompt, parseChatAnswer } from './chat'
import { message } from '../thread/thread'

describe('Prompt für den freien Chat', () => {
  const doc = '# Titel\n\nErster Absatz.\n\nZweiter Absatz mit Pointe.'

  it('enthält das ganze Dokument, die Cursorposition und den Verlauf', () => {
    const at = doc.indexOf('Pointe')
    const p = buildChatPrompt({ doc, focus: { from: at, to: at }, messages: [message({ kind: 'user', text: 'Fasse zusammen' })] })
    expect(p).toContain(doc)
    expect(p).toContain('Zeile 5')
    expect(p).toContain('mit ▍Pointe')
    expect(p).toContain('Autor: Fasse zusammen')
  })

  it('zeigt eine Markierung als solche', () => {
    const p = buildChatPrompt({ doc, focus: { from: 9, to: 23 }, messages: [] })
    expect(p).toContain('<markierung>\nErster Absatz.\n</markierung>')
  })

  it('lehnt Antworten ohne Text ab', () => {
    expect(() => parseChatAnswer({})).toThrow()
    expect(parseChatAnswer({ reply: '**ok**' })).toBe('**ok**')
  })
})
