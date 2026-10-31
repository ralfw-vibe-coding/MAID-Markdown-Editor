import type { Message } from '../thread/thread'

/**
 * Freier Chat mit Claude über das ganze Dokument. Anders als in den Threads
 * ändert die KI hier nichts am Manuskript – sie antwortet nur.
 */
export const CHAT_SYSTEM_PROMPT = `Du bist ein kluger, freundlicher Schreibassistent. Der Autor arbeitet in einem Markdown-Editor an einem Dokument und spricht mit dir im Seitenpanel.
Du kennst immer den aktuellen Stand des ganzen Dokuments und, falls angegeben, seine Cursorposition bzw. Markierung.

Regeln:
- Antworte in der Sprache des Autors. Formatiere deine Antwort in Markdown (Überschriften, Listen, Hervorhebungen), aber ohne unnötige Länge.
- Beziehe dich auf konkrete Stellen, indem du sie kurz zitierst.
- Du änderst das Dokument nicht selbst. Wenn der Autor eine Änderung möchte, schlage den neuen Wortlaut vor; er kann sie übernehmen oder an der Stelle einen Kommentar-Thread aufmachen (⇧⌘K), in dem du sie dann ausführen kannst.`

export const CHAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { reply: { type: 'string', description: 'Antwort an den Autor in Markdown' } },
  required: ['reply'],
}

export type EditorFocus = { from: number; to: number }

function focusDescription(doc: string, focus: EditorFocus | null): string {
  if (!focus) return 'Keine Angabe zur Cursorposition.'
  const line = doc.slice(0, focus.from).split('\n').length
  if (focus.from === focus.to) {
    const before = doc.slice(Math.max(0, focus.from - 80), focus.from)
    const after = doc.slice(focus.to, focus.to + 80)
    return `Der Cursor steht in Zeile ${line}: „…${before}▍${after}…“`
  }
  return `Der Autor hat ab Zeile ${line} markiert:\n<markierung>\n${doc.slice(focus.from, focus.to)}\n</markierung>`
}

export function buildChatPrompt(input: { doc: string; focus: EditorFocus | null; messages: Message[] }): string {
  const { doc, focus, messages } = input
  const transcript = messages
    .filter((m) => m.kind === 'user' || m.kind === 'ai')
    .map((m) => ('text' in m ? `${m.kind === 'user' ? 'Autor' : 'Assistent (du)'}: ${m.text}` : ''))
    .join('\n\n')
  return [
    '<dokument>',
    doc,
    '</dokument>',
    '',
    focusDescription(doc, focus),
    '',
    '<verlauf>',
    transcript,
    '</verlauf>',
    '',
    'Antworte auf die letzte Nachricht des Autors.',
  ].join('\n')
}

export function parseChatAnswer(data: unknown): string {
  const reply = (data as { reply?: unknown })?.reply
  if (typeof reply !== 'string') throw new Error('Unerwartete Antwort der KI')
  return reply
}
