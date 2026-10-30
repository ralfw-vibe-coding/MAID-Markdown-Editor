import type { Message } from '../thread/thread'

/** Markiert die besprochene Stelle im Dokument, das die KI sieht. */
export const MARK_START = '⟦'
export const MARK_END = '⟧'

/** „discuss“: normale Nachricht; „execute“: Autor hat „Umsetzen“ gedrückt. */
export type AskMode = 'discuss' | 'execute'

export type LektorAnswer = {
  reply: string
  edit: { oldText: string; newText: string } | null
}

export const SYSTEM_PROMPT = `Du bist ein erfahrener, freundlicher Lektor. Du arbeitest mit einem Autor an einem Markdown-Dokument.
Der Autor hat eine Stelle im Dokument markiert und kommentiert; ihr sprecht im Thread darüber.

Regeln:
- Antworte in der Sprache des Autors, knapp und konkret (meist 1–4 Sätze). Formulierungsvorschläge setzt du in Anführungszeichen.
- Du änderst das Dokument nur, wenn der Autor es ausdrücklich verlangt (siehe Auftrag). Sonst ist "edit" false und "oldText"/"newText" sind leer.
- Wenn du änderst ("edit": true):
  - "oldText" ist ein exakter, zusammenhängender Ausschnitt aus dem Markdown-Quelltext – ohne die Markierungszeichen ${MARK_START} ${MARK_END}. Er enthält die markierte Stelle oder überlappt sie. Halte ihn so kurz wie möglich: in der Regel genau die markierte Stelle, bei Bedarf bis zum ganzen Satz erweitert.
  - "newText" ersetzt "oldText" vollständig. Ändere nichts, was nicht besprochen wurde.
  - Markdown-Auszeichnungen (**, *, [](), \`) müssen in "newText" vollständig und ausgeglichen sein.
  - In "reply" sagst du in einem Satz, was du geändert hast.
- Ist unklar, welche Änderung gemeint ist, frage nach statt zu raten ("edit": false).`

export const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string', description: 'Antwort an den Autor' },
    edit: { type: 'boolean', description: 'true, wenn jetzt eine Änderung ausgeführt werden soll' },
    oldText: { type: 'string', description: 'Exakter zu ersetzender Markdown-Ausschnitt oder leer' },
    newText: { type: 'string', description: 'Ersatztext in Markdown oder leer' },
  },
  required: ['reply', 'edit', 'oldText', 'newText'],
}

function transcript(messages: Message[]): string {
  return messages
    .map((m) => {
      switch (m.kind) {
        case 'user':
          return `Autor: ${m.text}`
        case 'ai':
          return `Lektor (du): ${m.text}`
        case 'edit':
          return m.reverted
            ? `[Änderung wurde wieder zurückgenommen: „${m.before}“ → „${m.after}“]`
            : `[Änderung ausgeführt: „${m.before}“ → „${m.after}“]`
        case 'error':
          return `[Hinweis: ${m.text}]`
      }
    })
    .join('\n\n')
}

export function buildPrompt(input: { doc: string; from: number; to: number; messages: Message[]; mode: AskMode }): string {
  const { doc, from, to, messages, mode } = input
  const marked = doc.slice(0, from) + MARK_START + doc.slice(from, to) + MARK_END + doc.slice(to)
  const task =
    mode === 'execute'
      ? 'Der Autor hat „Umsetzen“ gedrückt. Führe jetzt die zuletzt besprochene Änderung aus ("edit": true). Wurde noch keine konkrete Änderung besprochen, aber die Absicht ist aus dem Kommentar klar, setze sie sinnvoll um. Ist unklar, was geändert werden soll, setze "edit": false und frage nach.'
      : 'Antworte auf die letzte Nachricht des Autors. Setze "edit": true nur, wenn der Autor in seiner letzten Nachricht ausdrücklich verlangt, dass du die Änderung jetzt vornimmst (z. B. „mach das“, „ändere es so“, „setz es um“, „ja, übernimm das“). Fragen, Einwände oder Überlegungen sind kein Auftrag.'
  return [
    '<dokument>',
    marked,
    '</dokument>',
    '',
    `Die besprochene Stelle (im Dokument zwischen ${MARK_START} und ${MARK_END}):`,
    '<stelle>',
    doc.slice(from, to),
    '</stelle>',
    '',
    '<verlauf>',
    transcript(messages),
    '</verlauf>',
    '',
    `<auftrag>${task}</auftrag>`,
  ].join('\n')
}

const stripMarks = (s: string) => s.replaceAll(MARK_START, '').replaceAll(MARK_END, '')

export function parseAnswer(data: unknown): LektorAnswer {
  const d = data as { reply?: unknown; edit?: unknown; oldText?: unknown; newText?: unknown }
  if (typeof d?.reply !== 'string') throw new Error('Unerwartete Antwort der KI')
  const edit = d.edit === true && typeof d.newText === 'string'
    ? { oldText: stripMarks(String(d.oldText ?? '')), newText: stripMarks(d.newText) }
    : null
  return { reply: d.reply, edit }
}
