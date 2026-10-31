import { StateEffect, StateField, type Text } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import { invertedEffects } from '@codemirror/commands'

/**
 * ok: Zitat steht unverändert im Anker.
 * geändert: Text im Anker wurde bearbeitet; Anker ist nachgeführt, aber prüfenswert.
 * verloren: Der Anker ist durch Löschung leer geworden.
 */
export type AnchorStatus = 'ok' | 'geändert' | 'verloren'

/** Position eines Kommentar-Threads im Markdown; `id` ist zugleich die Thread-ID. */
export type Anchor = {
  id: string
  from: number
  to: number
  /**
   * Einfügemarke statt Textbereich (from === to), z. B. die Cursorposition
   * oder das Textende. Eine Einfügemarke geht durch Löschungen nicht verloren.
   */
  point?: boolean
  /** Wortlaut zum Zeitpunkt der Markierung bzw. der letzten bestätigten Änderung. */
  quote: string
  prefix: string
  suffix: string
  status: AnchorStatus
}

const CONTEXT = 32

export function createAnchor(doc: Text, from: number, to: number): Anchor {
  return {
    id: crypto.randomUUID(),
    from,
    to,
    ...(from === to ? { point: true } : {}),
    quote: doc.sliceString(from, to),
    prefix: doc.sliceString(Math.max(0, from - CONTEXT), from),
    suffix: doc.sliceString(to, Math.min(doc.length, to + CONTEXT)),
    status: 'ok',
  }
}

/** Hat der Anker eine Stelle im Dokument (Textbereich oder Einfügemarke)? */
export const isPlaced = (a: Anchor) => a.from < a.to || !!a.point

export const addAnchor = StateEffect.define<Anchor>()
export const removeAnchor = StateEffect.define<string>()
/** Ersetzt alle Anker, z. B. nach dem Öffnen eines Dokuments. */
export const setAnchors = StateEffect.define<Anchor[]>()

type AnchorPlacement = { id: string; from: number; to: number; point?: boolean; quote: string; status: AnchorStatus }

/**
 * Setzt einen Anker explizit, z. B. auf den Ersatztext einer KI-Änderung.
 * Wird nach dem Mapping der Transaktion angewendet; Positionen beziehen sich
 * also auf das Dokument nach der Änderung.
 */
export const placeAnchor = StateEffect.define<AnchorPlacement>({
  map: (v, changes) => {
    const from = changes.mapPos(v.from, v.point ? -1 : 1)
    return { ...v, from, to: v.point ? from : Math.max(from, changes.mapPos(v.to, -1)) }
  },
})

class PointMarker extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-anchor-point'
    el.title = 'Kommentar an dieser Stelle'
    return el
  }
}

/**
 * Hält die Anker im Editorzustand, damit jede Transaktion sie automatisch
 * mitführt. Einfügungen direkt am Rand erweitern den Anker nicht; an einer
 * Einfügemarke Getipptes steht hinter der Marke.
 */
export const anchorField = StateField.define<Anchor[]>({
  create: () => [],
  update(anchors, tr) {
    let next = anchors
    if (tr.docChanged) {
      next = next.map((a) => {
        if (a.point) {
          const at = tr.changes.mapPos(a.from, -1)
          return { ...a, from: at, to: at }
        }
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
      else if (e.is(placeAnchor)) {
        const p = e.value
        next = next.map((a) => {
          if (a.id !== p.id) return a
          const { point: _old, ...rest } = a
          return { ...rest, ...(p.point ? { point: true } : {}), from: p.from, to: p.to, quote: p.quote, status: p.status }
        })
      }
    }
    return next
  },
  provide: (field) =>
    EditorView.decorations.from(field, (anchors) =>
      Decoration.set(
        anchors
          .filter(isPlaced)
          .map((a) =>
            a.point
              ? Decoration.widget({ widget: new PointMarker(), side: -1 }).range(a.from)
              : Decoration.mark({ class: `cm-anchor cm-anchor-${a.status}` }).range(a.from, a.to),
          ),
        true,
      ),
    ),
})

/**
 * Undo/Redo stellt Anker wieder her, die eine Transaktion explizit versetzt
 * oder durch Löschung geleert hat – sonst bliebe ein Anker nach Cmd+Z leer.
 */
export const anchorHistory = invertedEffects.of((tr) => {
  if (!tr.docChanged && !tr.effects.some((e) => e.is(placeAnchor))) return []
  const before = tr.startState.field(anchorField, false)
  const after = tr.state.field(anchorField, false)
  if (!before || !after) return []
  const restore: StateEffect<unknown>[] = []
  for (const old of before) {
    const now = after.find((a) => a.id === old.id)
    if (!now) continue
    const placed = tr.effects.some((e) => e.is(placeAnchor) && e.value.id === old.id)
    const emptied = old.from < old.to && now.from === now.to
    if (placed || emptied) {
      // Positionen im Dokument vor der Transaktion = nach dem Rückgängigmachen.
      restore.push(placeAnchor.of({ id: old.id, from: old.from, to: old.to, point: old.point, quote: old.quote, status: old.status }))
    }
  }
  return restore
})
