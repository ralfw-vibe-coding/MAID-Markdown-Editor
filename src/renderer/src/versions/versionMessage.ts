import { diffParagraphs } from './versions'

/** Claude formuliert die Nachricht einer Version aus den Änderungen – wie eine Commit-Nachricht. */
export const VERSION_MESSAGE_SYSTEM = `Du formulierst kurze Versionsnachrichten für Texte, wie Commit-Nachrichten.
- Sprache wie der Text, höchstens 60 Zeichen, ohne Punkt am Ende.
- Beschreibe inhaltlich, was sich geändert hat (z. B. „Einleitung gestrafft, Abschnitt zu Bildern ergänzt“), nicht technisch („Zeilen geändert“).`

export const VERSION_MESSAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { message: { type: 'string', description: 'Versionsnachricht' } },
  required: ['message'],
}

const clip = (s: string, n = 500) => (s.length > n ? s.slice(0, n) + ' …' : s)

/** Prompt mit den geänderten Absätzen (gekürzt), nicht dem ganzen Text. */
export function buildVersionMessagePrompt(previous: string, current: string): string {
  const parts = diffParagraphs(previous, current)
    .filter((d) => d.type !== 'same')
    .slice(0, 40)
    .map((d) =>
      d.type === 'changed'
        ? `GEÄNDERT\nvorher: ${clip(d.before)}\nnachher: ${clip(d.after)}`
        : `${d.type === 'added' ? 'NEU' : 'ENTFERNT'}: ${clip(d.text)}`,
    )
  return previous
    ? `Änderungen seit der letzten Version:\n\n${parts.join('\n\n') || '(keine)'}`
    : `Erste Version des Textes. Anfang:\n\n${clip(current, 2000)}`
}
