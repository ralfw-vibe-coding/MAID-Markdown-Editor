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
  /** Claude hat eine Fassung festhalten lassen; `existing`: der Stand war schon festgehalten. */
  | { id: string; kind: 'fassung'; title: string; existing?: boolean; at: string }

export type NewMessage =
  | { kind: 'user' | 'ai' | 'error'; text: string }
  | { kind: 'edit'; before: string; after: string; reverted?: boolean; elsewhere?: boolean }
  | { kind: 'fassung'; title: string; existing?: boolean }

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
 * Gleicht den Status der letzten Änderung in einem Verlauf mit dem Text ab:
 * Steht wieder der alte Text da (⌘Z, „Zurücknehmen“), gilt sie als
 * zurückgenommen, steht der neue da (Redo), als ausgeführt. Änderungen an
 * der kommentierten Stelle werden am Anker geprüft (`anchoredText`),
 * Änderungen an anderer Stelle im ganzen Dokument. Liefert denselben Verlauf
 * zurück, wenn sich nichts ändert.
 */
export function syncLastEdit(messages: Message[], anchoredText: string | null, doc: string): Message[] {
  const idx = messages.findLastIndex((m) => m.kind === 'edit')
  const m = messages[idx]
  if (!m || m.kind !== 'edit') return messages
  let reverted = m.reverted
  if (m.elsewhere) reverted = occursOnce(doc, m.after) ? false : doc.includes(m.before) ? true : m.reverted
  else if (anchoredText !== null) reverted = anchoredText === m.before ? true : anchoredText === m.after ? false : m.reverted
  if (reverted === m.reverted) return messages
  const next = [...messages]
  next[idx] = { ...m, reverted }
  return next
}

/** `syncLastEdit` für alle Threads; liefert dieselbe Liste, wenn sich nichts ändert. */
export function syncEditStates(threads: Thread[], anchoredText: (id: string) => string | null, doc: string): Thread[] {
  let changed = false
  const next = threads.map((t) => {
    const messages = syncLastEdit(t.messages, anchoredText(t.id), doc)
    if (messages === t.messages) return t
    changed = true
    return { ...t, messages }
  })
  return changed ? next : threads
}

export function appendMessage(threads: Thread[], id: string, m: Message): Thread[] {
  return updateThread(threads, id, (t) => ({ ...t, messages: [...t.messages, m] }))
}
