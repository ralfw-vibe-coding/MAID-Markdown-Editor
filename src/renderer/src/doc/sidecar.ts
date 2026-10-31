import type { Anchor } from '../anchor/anchors'
import { reanchor, type StoredAnchor } from '../anchor/reanchor'
import type { Message, Thread } from '../thread/thread'

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
  /** Freier Chat zum Dokument (fehlt in älteren Begleitdateien). */
  chat?: Message[]
}

export type StoredThread = {
  id: string
  createdAt: string
  anchor: StoredAnchor
  messages: Message[]
}

/** Frühe Fassung der Nachrichten (nur Autor-Kommentar). */
type LegacyMessage = { author: 'user' | 'ai'; text: string; at: string }

const CONTEXT = 32

export async function contentHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Liefert null, wenn es weder Threads noch Chat gibt – dann wird keine Begleitdatei geschrieben. */
export function serializeSidecar(
  doc: string,
  anchors: Anchor[],
  threads: Thread[],
  chat: Message[],
  documentName: string,
  hash: string,
): string | null {
  const stored: StoredThread[] = []
  for (const t of threads) {
    const a = anchors.find((x) => x.id === t.id)
    if (!a) continue
    stored.push({
      id: t.id,
      createdAt: t.createdAt,
      anchor: {
        from: a.from,
        to: a.to,
        quote: a.quote,
        text: doc.slice(a.from, a.to),
        prefix: doc.slice(Math.max(0, a.from - CONTEXT), a.from),
        suffix: doc.slice(a.to, a.to + CONTEXT),
        status: a.status,
        ...(a.point ? { point: true } : {}),
      },
      messages: t.messages,
    })
  }
  if (stored.length === 0 && chat.length === 0) return null
  const sidecar: Sidecar = {
    format: 'maid-sidecar',
    version: 1,
    document: documentName,
    contentHash: hash,
    savedAt: new Date().toISOString(),
    threads: stored,
    ...(chat.length > 0 ? { chat } : {}),
  }
  return JSON.stringify(sidecar, null, 2) + '\n'
}

export function parseSidecar(json: string): Sidecar {
  const data = JSON.parse(json) as Sidecar
  if (data?.format !== 'maid-sidecar' || data.version !== 1 || !Array.isArray(data.threads)) {
    throw new Error('Unbekanntes Format der Begleitdatei')
  }
  for (const t of data.threads) {
    t.messages = (t.messages as (Message | LegacyMessage)[]).map((m) =>
      'kind' in m ? m : { id: crypto.randomUUID(), kind: m.author, text: m.text, at: m.at },
    )
  }
  return data
}

/** Stellt Anker und Threads eines geöffneten Dokuments aus der Begleitdatei wieder her. */
export function restoreThreads(doc: string, sidecar: Sidecar, hash: string): { anchors: Anchor[]; threads: Thread[]; chat: Message[] } {
  const unchanged = sidecar.contentHash === hash
  const anchors = sidecar.threads.map((t): Anchor => {
    const placed = reanchor(doc, t.anchor, unchanged)
    return {
      id: t.id,
      ...placed,
      ...(t.anchor.point && placed.status !== 'verloren' ? { point: true } : {}),
      quote: t.anchor.quote,
      prefix: doc.slice(Math.max(0, placed.from - CONTEXT), placed.from),
      suffix: doc.slice(placed.to, placed.to + CONTEXT),
    }
  })
  const threads = sidecar.threads.map((t): Thread => ({ id: t.id, createdAt: t.createdAt, messages: t.messages }))
  return { anchors, threads, chat: sidecar.chat ?? [] }
}
