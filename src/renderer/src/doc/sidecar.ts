import type { Anchor } from '../anchor/anchors'
import { reanchor, type StoredAnchor } from '../anchor/reanchor'

/**
 * Begleitdatei `<dokument>.md.maid.json`: Kommentar-Threads und ihre Anker.
 * Das Markdown selbst bleibt frei von Metadaten.
 */
export type Sidecar = {
  format: 'maid-sidecar'
  version: 1
  /** Dateiname des Dokuments beim Sichern – nur zur Orientierung. */
  document: string
  /** SHA-256 des Dokuments beim Sichern; stimmt er beim Öffnen, gelten die Positionen direkt. */
  contentHash: string
  savedAt: string
  threads: StoredThread[]
}

export type StoredMessage = { author: 'user' | 'ai'; text: string; at: string }

export type StoredThread = {
  id: string
  createdAt: string
  anchor: StoredAnchor
  messages: StoredMessage[]
}

const CONTEXT = 32

export async function contentHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Liefert null, wenn es keine Kommentare gibt – dann wird keine Begleitdatei geschrieben. */
export function serializeSidecar(doc: string, anchors: Anchor[], documentName: string, hash: string): string | null {
  if (anchors.length === 0) return null
  const sidecar: Sidecar = {
    format: 'maid-sidecar',
    version: 1,
    document: documentName,
    contentHash: hash,
    savedAt: new Date().toISOString(),
    threads: anchors.map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      anchor: {
        from: a.from,
        to: a.to,
        quote: a.quote,
        text: doc.slice(a.from, a.to),
        prefix: doc.slice(Math.max(0, a.from - CONTEXT), a.from),
        suffix: doc.slice(a.to, a.to + CONTEXT),
        status: a.status,
      },
      messages: [{ author: 'user', text: a.comment, at: a.createdAt }],
    })),
  }
  return JSON.stringify(sidecar, null, 2) + '\n'
}

export function parseSidecar(json: string): Sidecar {
  const data = JSON.parse(json) as Sidecar
  if (data?.format !== 'maid-sidecar' || data.version !== 1 || !Array.isArray(data.threads)) {
    throw new Error('Unbekanntes Format der Begleitdatei')
  }
  return data
}

/** Stellt die Anker eines geöffneten Dokuments aus der Begleitdatei wieder her. */
export function restoreAnchors(doc: string, sidecar: Sidecar, hash: string): Anchor[] {
  const unchanged = sidecar.contentHash === hash
  return sidecar.threads.map((t) => {
    const placed = reanchor(doc, t.anchor, unchanged)
    return {
      id: t.id,
      ...placed,
      quote: t.anchor.quote,
      prefix: doc.slice(Math.max(0, placed.from - CONTEXT), placed.from),
      suffix: doc.slice(placed.to, placed.to + CONTEXT),
      comment: t.messages.find((m) => m.author === 'user')?.text ?? '',
      createdAt: t.createdAt,
    }
  })
}
