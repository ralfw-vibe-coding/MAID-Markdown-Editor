/** Ein Kommentar-Thread: Gespräch zwischen Autor und KI über eine verankerte Textstelle. */
export type Thread = {
  /** Gleich der ID des zugehörigen Ankers. */
  id: string
  createdAt: string
  messages: Message[]
}

export type Message =
  | { id: string; kind: 'user'; text: string; at: string }
  | { id: string; kind: 'ai'; text: string; at: string }
  /** Eine ausgeführte Änderung am Manuskript; `elsewhere`: nicht an der kommentierten Stelle. */
  | { id: string; kind: 'edit'; before: string; after: string; reverted: boolean; elsewhere?: boolean; at: string }
  | { id: string; kind: 'error'; text: string; at: string }

type NewMessage =
  | { kind: 'user' | 'ai' | 'error'; text: string }
  | { kind: 'edit'; before: string; after: string; reverted?: boolean; elsewhere?: boolean }

export function message(m: NewMessage): Message {
  const base = { id: crypto.randomUUID(), at: new Date().toISOString() }
  if (m.kind !== 'edit') return { ...base, ...m }
  return { ...base, kind: 'edit', before: m.before, after: m.after, reverted: m.reverted ?? false, ...(m.elsewhere ? { elsewhere: true } : {}) }
}

export function createThread(id: string, first?: string): Thread {
  return { id, createdAt: new Date().toISOString(), messages: first ? [message({ kind: 'user', text: first })] : [] }
}

/** Unveränderliche Aktualisierung eines Threads in der Liste. */
export function updateThread(threads: Thread[], id: string, f: (t: Thread) => Thread): Thread[] {
  return threads.map((t) => (t.id === id ? f(t) : t))
}

/** Kommt `needle` genau einmal in `doc` vor? */
export const occursOnce = (doc: string, needle: string) => needle !== '' && doc.indexOf(needle) >= 0 && doc.indexOf(needle) === doc.lastIndexOf(needle)

/**
 * Gleicht den Status der jeweils letzten Änderung eines Threads mit dem Text
 * ab: Steht wieder der alte Text da (⌘Z, „Zurücknehmen“), gilt sie als
 * zurückgenommen, steht dort der neue (Redo), als ausgeführt. Änderungen an
 * der kommentierten Stelle werden am Anker geprüft, Änderungen an anderer
 * Stelle im ganzen Dokument. Liefert dieselbe Liste zurück, wenn sich nichts ändert.
 */
export function syncEditStates(threads: Thread[], anchoredText: (id: string) => string | null, doc: string): Thread[] {
  let changed = false
  const next = threads.map((t) => {
    const idx = t.messages.findLastIndex((m) => m.kind === 'edit')
    const m = t.messages[idx]
    if (!m || m.kind !== 'edit') return t
    let reverted = m.reverted
    if (m.elsewhere) {
      reverted = occursOnce(doc, m.after) ? false : doc.includes(m.before) ? true : m.reverted
    } else {
      const text = anchoredText(t.id)
      if (text === null) return t
      reverted = text === m.before ? true : text === m.after ? false : m.reverted
    }
    if (reverted === m.reverted) return t
    changed = true
    const messages = [...t.messages]
    messages[idx] = { ...m, reverted }
    return { ...t, messages }
  })
  return changed ? next : threads
}

export function appendMessage(threads: Thread[], id: string, m: Message): Thread[] {
  return updateThread(threads, id, (t) => ({ ...t, messages: [...t.messages, m] }))
}
