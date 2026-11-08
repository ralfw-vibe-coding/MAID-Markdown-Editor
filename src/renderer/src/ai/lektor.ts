import type { Message } from '../thread/thread'
import { EDITS_SCHEMA_PROPERTY, parseEdits } from './edits'
import { FASSUNG_RULES, FASSUNG_SCHEMA_PROPERTY, parseFassung } from './fassung'
import type { EditRequest } from './planEdit'

/** Markiert die besprochene Stelle im Dokument, das die KI sieht. */
export const MARK_START = '⟦'
export const MARK_END = '⟧'

/** „discuss“: normale Nachricht; „execute“: Autor hat „Umsetzen“ gedrückt. */
export type AskMode = 'discuss' | 'execute'

export type LektorAnswer = {
  reply: string
  /** Leer, wenn nichts geändert werden soll. */
  edits: EditRequest[]
  /** Bezeichnung einer Fassung, die vor der Änderung festgehalten werden soll. */
  fassung: string | null
}

export const SYSTEM_PROMPT = `Du bist ein erfahrener, freundlicher Lektor. Du arbeitest mit einem Autor an einem Markdown-Dokument.
Der Autor hat eine Stelle im Dokument markiert und kommentiert; ihr sprecht im Thread darüber.
Statt einer Textstelle kann es auch eine Einfügemarke sein (${MARK_START}${MARK_END} ohne Text dazwischen): Dort steht der Cursor des Autors, z. B. am Textende oder zwischen zwei Absätzen.

Regeln:
- Antworte in der Sprache des Autors, knapp und konkret (meist 1–4 Sätze). Formulierungsvorschläge setzt du in Anführungszeichen.
- Du änderst das Dokument nur, wenn der Autor es ausdrücklich verlangt (siehe Auftrag). Sonst ist "edits" eine leere Liste.
- Wenn du änderst, steht jede Änderung als eigener Eintrag in "edits". Verlangt der Autor mehrere Änderungen („korrigiere alle Fehler“, „setz alle Vorschläge um“), führst du alle aus – nicht nur die erste. Alle Einträge beziehen sich auf das unveränderte Dokument und dürfen sich nicht überschneiden. Änderungen im selben Satz fasst du in einem Eintrag zusammen, sonst lieber mehrere kurze Einträge als ein langer Ausschnitt voller unverändertem Text. Für jeden Eintrag gilt:
  - "oldText" ist ein exakter, zusammenhängender Ausschnitt aus dem Markdown-Quelltext – ohne die Markierungszeichen ${MARK_START} ${MARK_END}. Normalerweise enthält er die markierte Stelle oder überlappt sie. Halte ihn so kurz wie möglich: in der Regel genau die markierte Stelle, bei Bedarf bis zum ganzen Satz erweitert. Er muss an der markierten Stelle genau einmal vorkommen.
  - Wurde besprochen, dass die Änderung an eine andere Stelle des Dokuments gehört, darf "oldText" dort liegen – dann muss er aber im ganzen Dokument genau einmal vorkommen (lieber einen ganzen Satz als ein einzelnes Wort). Zum Einfügen: "oldText" ist der Text direkt vor der Einfügestelle, "newText" derselbe Text plus das Neue.
  - "newText" ersetzt "oldText" vollständig. Ändere nichts, was nicht besprochen wurde.
  - An einer Einfügemarke: "oldText" leer lassen, um "newText" genau dort einzufügen (achte auf passende Leerzeichen und Leerzeilen am Anfang/Ende von "newText"), oder einen kurzen Ausschnitt angeben, der direkt an die Marke grenzt.
  - Markdown-Auszeichnungen (**, *, [](), \`) müssen in "newText" vollständig und ausgeglichen sein.
  - In "reply" sagst du in einem Satz, was du geändert hast.
- Ist unklar, welche Änderung gemeint ist, frage nach statt zu raten ("edits" leer).
${FASSUNG_RULES}`

export const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string', description: 'Antwort an den Autor' },
    edits: EDITS_SCHEMA_PROPERTY,
    fassung: FASSUNG_SCHEMA_PROPERTY,
  },
  required: ['reply', 'edits', 'fassung'],
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
          return `[Änderung ${m.reverted ? 'wurde wieder zurückgenommen' : 'ausgeführt'}${m.elsewhere ? ' (an anderer Stelle)' : ''}: „${m.before}“ → „${m.after}“]`
        case 'error':
          return `[Hinweis: ${m.text}]`
        case 'fassung':
          return `[Fassung festgehalten: „${m.title}“]`
      }
    })
    .join('\n\n')
}

export function buildPrompt(input: { doc: string; from: number; to: number; point?: boolean; messages: Message[]; mode: AskMode }): string {
  const { doc, from, to, point, messages, mode } = input
  const marked = doc.slice(0, from) + MARK_START + doc.slice(from, to) + MARK_END + doc.slice(to)
  const task =
    mode === 'execute'
      ? 'Der Autor hat „Umsetzen“ gedrückt. Führe jetzt die zuletzt besprochene Änderung aus – wurden mehrere besprochen, alle. Wurde noch keine konkrete Änderung besprochen, aber die Absicht ist aus dem Kommentar klar, setze sie sinnvoll um. Ist unklar, was geändert werden soll, lass "edits" leer und frage nach.'
      : 'Antworte auf die letzte Nachricht des Autors. Ändere nur ("edits" nicht leer), wenn der Autor in seiner letzten Nachricht ausdrücklich verlangt, dass du die Änderung jetzt vornimmst (z. B. „mach das“, „ändere es so“, „setz es um“, „ja, übernimm das“). Fragen, Einwände oder Überlegungen sind kein Auftrag.'
  return [
    '<dokument>',
    marked,
    '</dokument>',
    '',
    ...(point
      ? [
          `Besprochen wird eine Einfügemarke (Cursorposition, im Dokument als ${MARK_START}${MARK_END}). Kontext:`,
          '<stelle>',
          `…${doc.slice(Math.max(0, from - 200), from)}${MARK_START}${MARK_END}${doc.slice(to, to + 200)}…`,
          '</stelle>',
        ]
      : [`Die besprochene Stelle (im Dokument zwischen ${MARK_START} und ${MARK_END}):`, '<stelle>', doc.slice(from, to), '</stelle>']),
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
  const d = data as { reply?: unknown; edits?: unknown; fassung?: unknown }
  if (typeof d?.reply !== 'string') throw new Error('Unerwartete Antwort der KI')
  return { reply: d.reply, edits: parseEdits(d.edits, stripMarks), fassung: parseFassung(d.fassung) }
}
