/**
 * Claude kann MAID bitten, eine Fassung festzuhalten – auf Wunsch des Autors
 * oder weil er gebeten hat, vor (größeren) Änderungen den Stand zu sichern.
 * Gilt für Kommentar-Threads und Chats gleichermaßen.
 */
export const FASSUNG_RULES = `- Fassungen: MAID kann den Stand des Dokuments als „Fassung“ festhalten (wie ein Commit). Setze "fassung" auf eine kurze Bezeichnung (3–8 Wörter), wenn MAID jetzt eine Fassung festhalten soll, sonst lass es leer. Das tust du nur,
  - wenn der Autor es in seiner letzten Nachricht verlangt („halte eine Fassung fest“, „sichere den Stand“), oder
  - wenn der Autor im Verlauf gebeten hat, vor Änderungen (oder vor größeren Änderungen) eine Fassung festzuhalten, und du jetzt eine solche Änderung ausführst. Was „größer“ ist, entscheidest du nach seiner Bitte; Tippfehler und einzelne Wörter sind es in der Regel nicht.
  Die Fassung hält den Stand VOR deiner Änderung fest. Die Bezeichnung beschreibt diesen Stand, z. B. „Vor dem Kürzen der Einleitung“; ohne Änderung beschreibt sie den inhaltlichen Stand. Kündige in "reply" nur dann eine Fassung an, wenn du "fassung" setzt.`

export const FASSUNG_SCHEMA_PROPERTY = {
  type: 'string',
  description: 'Bezeichnung einer Fassung, die MAID jetzt (vor einer Änderung) festhalten soll, oder leer',
}

export function parseFassung(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
