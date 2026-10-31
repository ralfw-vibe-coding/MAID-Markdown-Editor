import type { Message } from '../thread/thread'

/**
 * Freier Chat mit Claude über das ganze Dokument. Auf ausdrücklichen Auftrag
 * darf Claude auch hier ändern – an der Markierung bzw. Cursorposition im
 * Manuskript oder an einer eindeutigen Textstelle. MAID führt die Änderung aus.
 */
export const CHAT_SYSTEM_PROMPT = `Du bist ein kluger, freundlicher Schreibassistent. Der Autor arbeitet in einem Markdown-Editor an einem Dokument und spricht mit dir im Seitenpanel.
Du kennst immer den aktuellen Stand des ganzen Dokuments und, falls angegeben, seine Cursorposition bzw. Markierung.

Regeln:
- Antworte in der Sprache des Autors. Formatiere "reply" in Markdown (Überschriften, Listen, Hervorhebungen), aber ohne unnötige Länge.
- Beziehe dich auf konkrete Stellen, indem du sie kurz zitierst.
- Du änderst das Dokument nur, wenn der Autor es in seiner letzten Nachricht ausdrücklich verlangt (z. B. „kürz das“, „schreib das um“, „füge hier … ein“, „korrigiere die Tippfehler in der Markierung“). Fragen, Bitten um Feedback oder Vorschläge sind kein Auftrag – dann ist "edit" false und "oldText"/"newText" sind leer; Formulierungsvorschläge stehen in "reply".
- Wenn du änderst ("edit": true), genau eine zusammenhängende Änderung:
  - Hat der Autor etwas markiert und bezieht sich darauf, ist "oldText" genau der markierte Text (oder ein Ausschnitt daraus) und "newText" sein Ersatz.
  - Ohne Markierung und mit dem Wunsch, an der Cursorposition einzufügen: "oldText" leer, "newText" ist der einzufügende Text (mit passenden Leerzeichen/Leerzeilen).
  - Sonst ist "oldText" ein exakter Ausschnitt aus dem Markdown-Quelltext, der im ganzen Dokument genau einmal vorkommt (lieber ein ganzer Satz als ein Wort); "newText" ersetzt ihn vollständig.
  - Markdown-Auszeichnungen müssen in "newText" ausgeglichen sein. Ändere nichts, was nicht verlangt wurde.
  - In "reply" sagst du kurz, was du geändert hast.
- Ist unklar, was geändert werden soll, frage nach statt zu raten ("edit": false).`

export const CHAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string', description: 'Antwort an den Autor in Markdown' },
    edit: { type: 'boolean', description: 'true, wenn jetzt eine Änderung ausgeführt werden soll' },
    oldText: { type: 'string', description: 'Exakter zu ersetzender Markdown-Ausschnitt oder leer' },
    newText: { type: 'string', description: 'Ersatztext in Markdown oder leer' },
    title: { type: 'string', description: 'Kurzer Titel für dieses Gespräch (2–5 Wörter, ohne Anführungszeichen)' },
  },
  required: ['reply', 'edit', 'oldText', 'newText', 'title'],
}

export type EditorFocus = { from: number; to: number }

export type ChatAnswer = { reply: string; edit: { oldText: string; newText: string } | null; title?: string }

function focusDescription(doc: string, focus: EditorFocus | null): string {
  if (!focus) return 'Keine Angabe zur Cursorposition.'
  const line = doc.slice(0, focus.from).split('\n').length
  if (focus.from === focus.to) {
    const before = doc.slice(Math.max(0, focus.from - 80), focus.from)
    const after = doc.slice(focus.to, focus.to + 80)
    return `Der Cursor steht in Zeile ${line} (keine Markierung): „…${before}▍${after}…“`
  }
  return `Der Autor hat ab Zeile ${line} markiert:\n<markierung>\n${doc.slice(focus.from, focus.to)}\n</markierung>`
}

function transcript(messages: Message[]): string {
  return messages
    .map((m) => {
      switch (m.kind) {
        case 'user':
          return `Autor: ${m.text}`
        case 'ai':
          return `Assistent (du): ${m.text}`
        case 'edit':
          return `[Änderung ${m.reverted ? 'wurde wieder zurückgenommen' : 'ausgeführt'}: „${m.before}“ → „${m.after}“]`
        case 'error':
          return `[Hinweis: ${m.text}]`
      }
    })
    .join('\n\n')
}

export function buildChatPrompt(input: { doc: string; focus: EditorFocus | null; messages: Message[] }): string {
  const { doc, focus, messages } = input
  return [
    '<dokument>',
    doc,
    '</dokument>',
    '',
    focusDescription(doc, focus),
    '',
    '<verlauf>',
    transcript(messages),
    '</verlauf>',
    '',
    'Antworte auf die letzte Nachricht des Autors.',
  ].join('\n')
}

export function parseChatAnswer(data: unknown): ChatAnswer {
  const d = data as { reply?: unknown; edit?: unknown; oldText?: unknown; newText?: unknown; title?: unknown }
  if (typeof d?.reply !== 'string') throw new Error('Unerwartete Antwort der KI')
  const edit = d.edit === true && typeof d.newText === 'string' ? { oldText: String(d.oldText ?? ''), newText: d.newText } : null
  return { reply: d.reply, edit, title: typeof d.title === 'string' ? d.title : undefined }
}
