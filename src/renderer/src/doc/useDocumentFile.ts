import { useEffect, useRef, useState } from 'react'
import type { MaidHost, MenuCommand } from '../../../shared/host'
import type { Anchor } from '../anchor/anchors'
import type { Thread } from '../thread/thread'
import type { Chat } from '../chat/chats'
import { contentHash, parseSidecar, restoreThreads, serializeSidecar } from './sidecar'

const fileName = (path: string | null) => (path ? path.split('/').pop()! : 'Unbenannt')

function sameAnchors(a: Anchor[], b: Anchor[]): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => {
      const y = b[i]
      return x.id === y.id && x.from === y.from && x.to === y.to && x.status === y.status
    })
  )
}

type Options = {
  host: MaidHost | null
  initialDoc: string
  doc: string
  anchors: Anchor[]
  threads: Thread[]
  chats: Chat[]
  /** Lädt Text, Anker, Threads und Chats (setzt die Undo-Historie zurück). */
  load: (content: string, anchors: Anchor[], threads: Thread[], chats: Chat[]) => void
}

/**
 * Datei-Lebenszyklus des aktuellen Dokuments: Neu, Öffnen, Sichern, Sichern unter,
 * ungesicherte Änderungen. Kommentare werden in der Begleitdatei mitgesichert.
 */
export function useDocumentFile({ host, initialDoc, doc, anchors, threads, chats, load }: Options) {
  const [path, setPath] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ doc: string; anchors: Anchor[]; threads: Thread[]; chats: Chat[] }>({ doc: initialDoc, anchors: [], threads: [], chats: [] })
  /** Begleitdatei war nicht lesbar: beim Sichern nicht überschreiben. */
  const [keepSidecar, setKeepSidecar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const threadsChanged = threads !== saved.threads && (threads.length > 0 || saved.threads.length > 0)
  // Leere, noch unbenutzte Chats zählen nicht als Änderung.
  const used = (cs: Chat[]) => cs.filter((c) => c.messages.length > 0)
  const chatChanged = chats !== saved.chats && (used(chats).length > 0 || used(saved.chats).length > 0)
  const dirty = doc !== saved.doc || threadsChanged || chatChanged || !sameAnchors(anchors, saved.anchors)
  const name = fileName(path)

  /** Sichert; liefert den Pfad oder null, wenn abgebrochen. */
  async function save(asNew = false): Promise<string | null> {
    if (!host) return null
    const target = asNew || !path ? await host.saveDialog(path ? name : 'Unbenannt.md') : path
    if (!target) return null
    const content = doc
    const current = { anchors, threads, chats }
    const sidecar =
      keepSidecar && threads.length === 0 && used(chats).length === 0
        ? undefined
        : serializeSidecar(content, anchors, threads, chats, fileName(target), await contentHash(content))
    await host.write(target, content, sidecar)
    setPath(target)
    setSaved({ doc: content, ...current })
    if (threads.length > 0 || used(chats).length > 0) setKeepSidecar(false)
    return target
  }

  /** Fragt bei ungesicherten Änderungen nach; true = weitermachen. */
  async function confirmLeave(): Promise<boolean> {
    if (!host || !dirty) return true
    const choice = await host.confirmDiscard(name)
    if (choice === 'cancel') return false
    if (choice === 'save') return (await save()) !== null
    return true
  }

  async function newDocument() {
    if (!(await confirmLeave())) return
    load('', [], [], [])
    setPath(null)
    setSaved({ doc: '', anchors: [], threads: [], chats: [] })
    setKeepSidecar(false)
  }

  async function open(target?: string) {
    if (!host || !(await confirmLeave())) return
    const chosen = target ?? (await host.openDialog())
    if (!chosen) return
    const file = await host.read(chosen)
    let restored: { anchors: Anchor[]; threads: Thread[]; chats: Chat[] } = { anchors: [], threads: [], chats: [] }
    let sidecarBroken = false
    if (file.sidecar !== null) {
      try {
        restored = restoreThreads(file.content, parseSidecar(file.sidecar), await contentHash(file.content))
      } catch (err) {
        sidecarBroken = true
        setError(`Kommentare konnten nicht gelesen werden (${(err as Error).message}). Die Begleitdatei bleibt unverändert.`)
      }
    }
    load(file.content, restored.anchors, restored.threads, restored.chats)
    setPath(chosen)
    setSaved({ doc: file.content, ...restored })
    setKeepSidecar(sidecarBroken)
  }

  // Nur die Datei-Befehle; die übrigen Menübefehle behandelt die App selbst.
  const actions: Partial<Record<MenuCommand, () => Promise<unknown>>> = {
    new: newDocument,
    open: () => open(),
    save: () => save(),
    saveAs: () => save(true),
    saveAndClose: async () => {
      if (await save()) host?.closeConfirmed()
    },
  }
  // Menü-Handler werden einmal registriert und rufen immer die aktuellen Aktionen auf.
  const latest = useRef({ actions, open })
  latest.current = { actions, open }

  const run = (action: () => Promise<unknown>) =>
    action().catch((err: Error) => setError(err.message || String(err)))

  useEffect(() => {
    if (!host) return
    const offMenu = host.onMenu((command) => {
      const action = latest.current.actions[command]
      if (action) run(action)
    })
    const offOpen = host.onOpenPath((p) => run(() => latest.current.open(p)))
    host.ready()
    return () => {
      offMenu()
      offOpen()
    }
  }, [host])

  useEffect(() => {
    host?.setDocumentState({ path, dirty, empty: doc.length === 0 })
  }, [host, path, dirty, doc.length === 0])

  /** Pfad des Dokuments; ein neues Dokument wird dafür erst gesichert (null = abgebrochen). */
  async function ensurePath(): Promise<string | null> {
    return path ?? (await save())
  }

  return { path, name, dirty, error, ensurePath, showError: setError, clearError: () => setError(null) }
}
