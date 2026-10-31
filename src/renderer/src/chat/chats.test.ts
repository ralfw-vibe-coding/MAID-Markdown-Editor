import { describe, expect, it } from 'vitest'
import { createChat, renameChat, suggestTitle } from './chats'

describe('Chat-Titel', () => {
  it('Claudes Vorschlag wird übernommen, solange es keinen Titel gibt', () => {
    const c = suggestTitle(createChat(), '„Zusammenfassung der Skizze“')
    expect(c.title).toBe('Zusammenfassung der Skizze')
    expect(suggestTitle(c, 'Etwas anderes').title).toBe('Zusammenfassung der Skizze')
  })

  it('ein vom Autor gesetzter Titel bleibt, auch gegen Vorschläge', () => {
    const c = renameChat(createChat(), 'Meine Fragen')
    expect(c).toMatchObject({ title: 'Meine Fragen', titleByUser: true })
    expect(suggestTitle(c, 'Vorschlag').title).toBe('Meine Fragen')
  })

  it('leerer Name setzt zurück, dann darf Claude wieder vorschlagen', () => {
    const c = renameChat(renameChat(createChat(), 'X'), '  ')
    expect(c).toMatchObject({ title: '', titleByUser: false })
    expect(suggestTitle(c, 'Neu').title).toBe('Neu')
  })
})
