import { useEffect, useRef, useState } from 'react'
import type { MaidHost, MenuCommand } from '../../../shared/host'
import type { Anchor } from '../anchor/anchors'
import { contentHash, parseSidecar, restoreAnchors, serializeSidecar } from './sidecar'

const fileName = (path: string | null) => (path ? path.split('/').pop()! : 'Unbenannt')

function sameAnchors(a: Anchor[], b: Anchor[]): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => {
      const y = b[i]
      return x.id === y.id && x.from === y.from && x.to === y.to && x.status === y.status && x.comment === y.comment
    })
  )
}

type Options = {
  host: MaidHost | null
  initialDoc: string
  doc: string
  anchors: Anchor[]
  /** Lädt Text und Anker in den Editor (setzt Undo-Historie zurück). */
  load: (content: string, anchors: Anchor[]) => void
}

/**
 * Datei-Lebenszyklus des aktuellen Dokuments: Neu, Öffnen, Sichern, Sichern unter,
 * ungesicherte Änderungen. Kommentare werden in der Begleitdatei mitgesichert.
 */
export function useDocumentFile({ host, initialDoc, doc, anchors, load }: Options) {
  const [path, setPath] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ doc: string; anchors: Anchor[] }>({ doc: initialDoc, anchors: [] })
  /** Begleitdatei war nicht lesbar: beim Sichern nicht überschreiben. */
  const [keepSidecar, setKeepSidecar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = doc !== saved.doc || !sameAnchors(anchors, saved.anchors)
  const name = fileName(path)

  async function save(asNew = false): Promise<boolean> {
    if (!host) return false
    const target = asNew || !path ? await host.saveDialog(path ? name : 'Unbenannt.md') : path
    if (!target) return false
    const content = doc
    const current = anchors
    const sidecar = keepSidecar && current.length === 0 ? undefined : serializeSidecar(content, current, fileName(target), await contentHash(content))
    await host.write(target, content, sidecar)
    setPath(target)
    setSaved({ doc: content, anchors: current })
    if (current.length > 0) setKeepSidecar(false)
    return true
  }

  /** Fragt bei ungesicherten Änderungen nach; true = weitermachen. */
  async function confirmLeave(): Promise<boolean> {
    if (!host || !dirty) return true
    const choice = await host.confirmDiscard(name)
    if (choice === 'cancel') return false
    if (choice === 'save') return save()
    return true
  }

  async function newDocument() {
    if (!(await confirmLeave())) return
    load('', [])
    setPath(null)
    setSaved({ doc: '', anchors: [] })
    setKeepSidecar(false)
  }

  async function open(target?: string) {
    if (!host || !(await confirmLeave())) return
    const chosen = target ?? (await host.openDialog())
    if (!chosen) return
    const file = await host.read(chosen)
    let restored: Anchor[] = []
    let sidecarBroken = false
    if (file.sidecar !== null) {
      try {
        restored = restoreAnchors(file.content, parseSidecar(file.sidecar), await contentHash(file.content))
      } catch (err) {
        sidecarBroken = true
        setError(`Kommentare konnten nicht gelesen werden (${(err as Error).message}). Die Begleitdatei bleibt unverändert.`)
      }
    }
    load(file.content, restored)
    setPath(chosen)
    setSaved({ doc: file.content, anchors: restored })
    setKeepSidecar(sidecarBroken)
  }

  const actions: Record<MenuCommand, () => Promise<unknown>> = {
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
    const offMenu = host.onMenu((command) => run(latest.current.actions[command]))
    const offOpen = host.onOpenPath((p) => run(() => latest.current.open(p)))
    host.ready()
    return () => {
      offMenu()
      offOpen()
    }
  }, [host])

  useEffect(() => {
    host?.setDocumentState({ path, dirty })
  }, [host, path, dirty])

  return { path, name, dirty, error, clearError: () => setError(null) }
}
