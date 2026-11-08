import type { EditRequest } from './planEdit'

/**
 * Claude kann in einer Antwort mehrere Stellen ändern – z. B. „korrigiere alle
 * Tippfehler“. Jede Änderung ist ein Paar aus altem und neuem Text; MAID führt
 * alle zusammen als einen Undo-Schritt aus. Gilt für Threads und Chats.
 */
export const EDITS_SCHEMA_PROPERTY = {
  type: 'array',
  description: 'Die jetzt auszuführenden Änderungen, je Stelle ein Eintrag; leer, wenn nichts geändert werden soll',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      oldText: { type: 'string', description: 'Exakter zu ersetzender Markdown-Ausschnitt oder leer' },
      newText: { type: 'string', description: 'Ersatztext in Markdown oder leer' },
    },
    required: ['oldText', 'newText'],
  },
}

export function parseEdits(value: unknown, clean: (s: string) => string = (s) => s): EditRequest[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((e): e is { oldText?: unknown; newText: string } => typeof e?.newText === 'string')
    .map((e) => ({ oldText: clean(String(e.oldText ?? '')), newText: clean(e.newText) }))
}
