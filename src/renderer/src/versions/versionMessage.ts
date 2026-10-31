import { diffParagraphs } from './versions'

/** Claude formuliert die Nachricht einer Version aus den Änderungen – wie eine Commit-Nachricht. */
export const VERSION_MESSAGE_SYSTEM = `Du benennst Fassungen eines Textes, ähnlich einer Commit-Nachricht, aber für Autoren.
Beschreibe den inhaltlichen Kern der Änderungen: Was bedeuten sie für Aussage, Argumentation, Ton oder Aufbau des Textes? Was kann der Leser jetzt, was er vorher nicht konnte?
- Nicht aufzählen, welche Wörter oder Absätze sich geändert haben, sondern die Wirkung benennen – z. B. „Leitidee schärfer auf Zusammenarbeit ausgerichtet“, „Bilder-Kapitel ergänzt, Ablage geklärt“, „Ton der Einleitung persönlicher“.
- Bei sehr kleinen Änderungen (Tippfehler, Kommas): z. B. „Kleine Korrekturen“.
- Sprache wie der Text, höchstens 70 Zeichen, ohne Punkt am Ende, ohne Anführungszeichen.`

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
    ? `Änderungen seit der letzten Fassung:\n\n${parts.join('\n\n') || '(keine)'}`
    : `Erste Fassung des Textes. Anfang:\n\n${clip(current, 2000)}`
}
