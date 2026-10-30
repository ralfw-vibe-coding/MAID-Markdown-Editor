import { StateEffect, StateField, type Text } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'

/**
 * ok: Zitat steht unverändert im Anker.
 * geändert: Text im Anker wurde bearbeitet; Anker ist nachgeführt, aber prüfenswert.
 * verloren: Der Anker ist durch Löschung leer geworden.
 */
export type AnchorStatus = 'ok' | 'geändert' | 'verloren'

export type Anchor = {
  id: string
  from: number
  to: number
  /** Wortlaut zum Zeitpunkt der Markierung bzw. der letzten bestätigten Änderung. */
  quote: string
  prefix: string
  suffix: string
  status: AnchorStatus
  comment: string
  createdAt: string
}

const CONTEXT = 32

export function createAnchor(doc: Text, from: number, to: number, comment: string): Anchor {
  return {
    id: crypto.randomUUID(),
    from,
    to,
    quote: doc.sliceString(from, to),
    prefix: doc.sliceString(Math.max(0, from - CONTEXT), from),
    suffix: doc.sliceString(to, Math.min(doc.length, to + CONTEXT)),
    status: 'ok',
    comment,
    createdAt: new Date().toISOString(),
  }
}

export const addAnchor = StateEffect.define<Anchor>()
export const removeAnchor = StateEffect.define<string>()
/** Ersetzt alle Anker, z. B. nach dem Öffnen eines Dokuments. */
export const setAnchors = StateEffect.define<Anchor[]>()

/**
 * Hält die Anker im Editorzustand, damit jede Transaktion sie automatisch
 * mitführt. Einfügungen direkt am Rand erweitern den Anker nicht.
 */
export const anchorField = StateField.define<Anchor[]>({
  create: () => [],
  update(anchors, tr) {
    let next = anchors
    if (tr.docChanged) {
      next = next.map((a) => {
        const from = tr.changes.mapPos(a.from, 1)
        const to = Math.max(from, tr.changes.mapPos(a.to, -1))
        const status: AnchorStatus =
          from === to ? 'verloren' : tr.state.doc.sliceString(from, to) === a.quote ? 'ok' : 'geändert'
        return { ...a, from, to, status }
      })
    }
    for (const e of tr.effects) {
      if (e.is(setAnchors)) next = e.value
      else if (e.is(addAnchor)) next = [...next, e.value]
      else if (e.is(removeAnchor)) next = next.filter((a) => a.id !== e.value)
    }
    return next
  },
  provide: (field) =>
    EditorView.decorations.from(field, (anchors) =>
      Decoration.set(
        anchors
          .filter((a) => a.from < a.to)
          .map((a) => Decoration.mark({ class: `cm-anchor cm-anchor-${a.status}` }).range(a.from, a.to)),
        true,
      ),
    ),
})
