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
  /**
   * Eine ausgeführte Änderung am Manuskript; `elsewhere`: nicht an der kommentierten Stelle.
   * Änderungen aus derselben KI-Antwort tragen dieselbe `batch`-Kennung.
   */
  | { id: string; kind: 'edit'; before: string; after: string; reverted: boolean; elsewhere?: boolean; batch?: string; at: string }
  | { id: string; kind: 'error'; text: string; at: string }
  /** Claude hat eine Fassung festhalten lassen; `existing`: der Stand war schon festgehalten. */
  | { id: string; kind: 'fassung'; title: string; existing?: boolean; at: string }

export type NewMessage =
  | { kind: 'user' | 'ai' | 'error'; text: string }
  | { kind: 'edit'; before: string; after: string; reverted?: boolean; elsewhere?: boolean; batch?: string }
  | { kind: 'fassung'; title: string; existing?: boolean }

export function message(m: NewMessage): Message {
  const base = { id: crypto.randomUUID(), at: new Date().toISOString() }
  if (m.kind !== 'edit') return { ...base, ...m }
  return {
    ...base,
    kind: 'edit',
    before: m.before,
    after: m.after,
    reverted: m.reverted ?? false,
    ...(m.elsewhere ? { elsewhere: true } : {}),
    ...(m.batch ? { batch: m.batch } : {}),
  }
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

export type EditMessage = Extract<Message, { kind: 'edit' }>

/** Die Änderungen der letzten KI-Antwort, die etwas geändert hat (eine Antwort kann mehrere Stellen ändern). */
export function lastEdits(messages: Message[]): EditMessage[] {
  const last = messages.findLast((m): m is EditMessage => m.kind === 'edit')
  if (!last) return []
  return last.batch ? messages.filter((m): m is EditMessage => m.kind === 'edit' && m.batch === last.batch) : [last]
}

/**
 * Wird diese Änderung am Anker geprüft? Nur wenn sie als einzige ihrer Antwort
 * die kommentierte Stelle betrifft – dann sitzt der Anker genau auf ihrem Text.
 * Alle anderen werden im ganzen Dokument gesucht.
 */
export const checkedAtAnchor = (m: EditMessage, batch: EditMessage[]) => !m.elsewhere && batch.filter((x) => !x.elsewhere).length === 1

/**
 * Gleicht den Status der letzten Änderungen in einem Verlauf mit dem Text ab:
 * Steht wieder der alte Text da (⌘Z, „Zurücknehmen“), gilt eine Änderung als
 * zurückgenommen, steht der neue da (Redo), als ausgeführt. Am Anker geprüft
 * wird mit `anchoredText`, sonst im ganzen Dokument. Liefert denselben Verlauf
 * zurück, wenn sich nichts ändert.
 */
export function syncLastEdits(messages: Message[], anchoredText: string | null, doc: string): Message[] {
  const batch = lastEdits(messages)
  let next = messages
  for (const m of batch) {
    let reverted = m.reverted
    if (!checkedAtAnchor(m, batch)) reverted = occursOnce(doc, m.after) ? false : doc.includes(m.before) ? true : m.reverted
    else if (anchoredText !== null) reverted = anchoredText === m.before ? true : anchoredText === m.after ? false : m.reverted
    if (reverted === m.reverted) continue
    if (next === messages) next = [...messages]
    next[messages.indexOf(m)] = { ...m, reverted }
  }
  return next
}

/** `syncLastEdits` für alle Threads; liefert dieselbe Liste, wenn sich nichts ändert. */
export function syncEditStates(threads: Thread[], anchoredText: (id: string) => string | null, doc: string): Thread[] {
  let changed = false
  const next = threads.map((t) => {
    const messages = syncLastEdits(t.messages, anchoredText(t.id), doc)
    if (messages === t.messages) return t
    changed = true
    return { ...t, messages }
  })
  return changed ? next : threads
}

export function appendMessage(threads: Thread[], id: string, m: Message): Thread[] {
  return updateThread(threads, id, (t) => ({ ...t, messages: [...t.messages, m] }))
}
