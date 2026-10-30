import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { basicSetup } from 'codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import type { MaidHost } from '../../shared/host'
import { buildPreview } from './render/buildPreview'
import { Preview } from './render/Preview'
import { domRangeToSource, sourceToDomRange, type SourceRange } from './anchor/selection'
import {
  addAnchor,
  anchorField,
  anchorHistory,
  createAnchor,
  placeAnchor,
  removeAnchor,
  setAnchors as setAnchorsEffect,
  type Anchor,
} from './anchor/anchors'
import { sampleDoc } from './sampleDoc'
import { markdownKeymap } from './editor/markdownKeymap'
import { useDocumentFile } from './doc/useDocumentFile'
import { appendMessage, createThread, message, syncEditStates, updateThread, type Thread } from './thread/thread'
import { ThreadPanel } from './thread/ThreadPanel'
import { buildPrompt, parseAnswer, RESPONSE_SCHEMA, SYSTEM_PROMPT, type AskMode } from './ai/lektor'
import { minimalChange, planEdit } from './ai/planEdit'

declare global {
  interface Window {
    /** Vom Electron-Preload bereitgestellt; fehlt in der reinen Web-Variante. */
    maid?: MaidHost
  }
}

const host = window.maid ?? null
/** In der App startet MAID mit einem leeren Dokument, im Browser mit dem Probetext. */
const initialDoc = host ? '' : sampleDoc

type Pending = SourceRange & { x: number; y: number }

const THREADS_WIDTH = 360
const SPLITTER_WIDTH = 5
const SPLIT_KEY = 'maid.split'

const clampSplit = (v: number) => Math.min(0.85, Math.max(0.15, v))

/** Anteil des Manuskripts an der Breite von Manuskript + Druckfahne. */
function loadSplit(): number {
  try {
    const v = Number(localStorage.getItem(SPLIT_KEY))
    return v ? clampSplit(v) : 0.5
  } catch {
    return 0.5
  }
}

function saveSplit(v: number) {
  try {
    localStorage.setItem(SPLIT_KEY, String(v))
  } catch {
    // ohne Speicher bleibt die Breite nur bis zum Neuladen
  }
}

export function App() {
  const editorHost = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [doc, setDoc] = useState(initialDoc)
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const [threads, setThreads] = useState<Thread[]>([])
  /** Threads, in denen gerade eine KI-Anfrage läuft. */
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = useState<Pending | null>(null)
  const [draft, setDraft] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [split, setSplit] = useState(loadSplit)
  const [dragging, setDragging] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const model = useMemo(() => buildPreview(doc), [doc])
  // Undo/Redo im Editor im Thread nachziehen, damit Anzeige und KI-Verlauf stimmen.
  useEffect(() => {
    setThreads((ts) =>
      syncEditStates(ts, (id) => {
        const a = anchors.find((x) => x.id === id)
        return a && a.from < a.to ? doc.slice(a.from, a.to) : null
      }),
    )
  }, [anchors, doc])

  // Laufende KI-Anfragen brauchen den aktuellen Stand, nicht den ihres Starts.
  const threadsRef = useRef(threads)
  threadsRef.current = threads

  const extensions = useMemo<Extension[]>(
    () => [
      basicSetup,
      markdown({ addKeymap: false }),
      markdownKeymap,
      EditorView.lineWrapping,
      anchorField,
      anchorHistory,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) setDoc(u.state.doc.toString())
        const next = u.state.field(anchorField)
        if (next !== u.startState.field(anchorField)) setAnchors(next)
      }),
    ],
    [],
  )

  useEffect(() => {
    const view = new EditorView({ parent: editorHost.current!, doc: initialDoc, extensions })
    viewRef.current = view
    return () => view.destroy()
  }, [extensions])

  const file = useDocumentFile({
    host,
    initialDoc,
    doc,
    anchors,
    threads,
    load(content, loaded, loadedThreads) {
      const view = viewRef.current!
      view.setState(EditorState.create({ doc: content, extensions }))
      setDoc(content)
      setAnchors([])
      view.dispatch({ effects: setAnchorsEffect.of(loaded) })
      setThreads(loadedThreads)
      setBusy(new Set())
      setPending(null)
      setActiveId(null)
      view.focus()
    },
  })

  // Anker in der Druckfahne über die CSS Custom Highlight API markieren – ohne DOM-Umbau.
  useLayoutEffect(() => {
    const root = previewRef.current
    if (!root || !('highlights' in CSS)) return
    const all: Range[] = []
    const active: Range[] = []
    for (const a of anchors) {
      const r = sourceToDomRange(a, root, model.segments)
      if (!r) continue
      ;(a.id === activeId ? active : all).push(r)
    }
    CSS.highlights.set('maid-anchor', new Highlight(...all))
    CSS.highlights.set('maid-active', new Highlight(...active))
    // Die Browser-Auswahl geht verloren, sobald das Kommentarfeld den Fokus bekommt.
    const pendingRange = pending && sourceToDomRange(pending, root, model.segments)
    CSS.highlights.set('maid-pending', new Highlight(...(pendingRange ? [pendingRange] : [])))
  }, [model, anchors, activeId, pending])

  function onPreviewMouseUp() {
    const sel = window.getSelection()
    const root = previewRef.current
    if (!sel || sel.isCollapsed || !root) return setPending(null)
    const range = sel.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return setPending(null)
    const src = domRangeToSource(range, root, model.segments)
    if (!src) return setPending(null)
    const rect = range.getBoundingClientRect()
    setPending({ ...src, x: rect.left, y: rect.bottom + 6 })
    setDraft('')
  }

  function comment(withAi: boolean) {
    const view = viewRef.current
    if (!view || !pending || !draft.trim()) return
    const anchor = createAnchor(view.state.doc, pending.from, pending.to)
    view.dispatch({ effects: addAnchor.of(anchor) })
    const thread = createThread(anchor.id, draft.trim())
    setThreads((ts) => [...ts, thread])
    threadsRef.current = [...threadsRef.current, thread]
    setPending(null)
    setActiveId(anchor.id)
    window.getSelection()?.removeAllRanges()
    if (withAi && host) void askAi(anchor.id, 'discuss')
  }

  const appendTo = (id: string, m: Parameters<typeof message>[0]) => setThreads((ts) => appendMessage(ts, id, message(m)))
  const currentAnchor = (id: string) => viewRef.current?.state.field(anchorField).find((a) => a.id === id)

  /**
   * Ersetzt `oldText` durch `newText` an der Stelle des Threads – als eine
   * Editor-Transaktion (ein Undo-Schritt). Der Anker wird explizit auf den
   * Ersatztext gesetzt. Liefert den ersetzten Text oder eine Fehlermeldung.
   */
  function replaceAtAnchor(id: string, oldText: string, newText: string): { before: string } | { error: string } {
    const view = viewRef.current
    const anchor = currentAnchor(id)
    if (!view || !anchor) return { error: 'Der Thread hat keine Stelle mehr im Dokument.' }
    const text = view.state.doc.toString()
    const plan = planEdit(text, anchor, oldText, newText)
    if ('error' in plan) return plan
    const change = minimalChange(text, plan)
    view.dispatch({
      changes: { from: change.from, to: change.to, insert: change.insert },
      effects: placeAnchor.of({ id, from: plan.from, to: plan.from + newText.length, quote: newText, status: 'ok' }),
      userEvent: 'input.maid',
    })
    return { before: text.slice(plan.from, plan.to) }
  }

  async function askAi(id: string, mode: AskMode) {
    if (!host) return appendTo(id, { kind: 'error', text: 'Die KI ist nur in der App verfügbar.' })
    const view = viewRef.current
    const anchor = currentAnchor(id)
    const thread = threadsRef.current.find((t) => t.id === id)
    if (!view || !anchor || !thread) return
    setBusy((b) => new Set(b).add(id))
    try {
      const prompt = buildPrompt({ doc: view.state.doc.toString(), from: anchor.from, to: anchor.to, messages: thread.messages, mode })
      const result = await host.askAi({ prompt, systemPrompt: SYSTEM_PROMPT, schema: RESPONSE_SCHEMA })
      if (!result.ok) return appendTo(id, { kind: 'error', text: result.error })
      const answer = parseAnswer(result.data)
      appendTo(id, { kind: 'ai', text: answer.reply })
      if (answer.edit) {
        const done = replaceAtAnchor(id, answer.edit.oldText, answer.edit.newText)
        appendTo(id, 'error' in done ? { kind: 'error', text: done.error } : { kind: 'edit', before: done.before, after: answer.edit.newText })
      }
    } catch (err) {
      appendTo(id, { kind: 'error', text: (err as Error).message })
    } finally {
      setBusy((b) => {
        const next = new Set(b)
        next.delete(id)
        return next
      })
    }
  }

  function send(id: string, text: string) {
    appendTo(id, { kind: 'user', text })
    // Der neue Beitrag ist erst nach dem nächsten Render im Thread; askAi liest über die Ref.
    threadsRef.current = appendMessage(threadsRef.current, id, message({ kind: 'user', text }))
    if (host) void askAi(id, 'discuss')
  }

  function revert(id: string, messageId: string) {
    const m = threadsRef.current.find((t) => t.id === id)?.messages.find((x) => x.id === messageId)
    if (!m || m.kind !== 'edit') return
    const done = replaceAtAnchor(id, m.after, m.before)
    if ('error' in done) return appendTo(id, { kind: 'error', text: done.error })
    setThreads((ts) =>
      updateThread(ts, id, (t) => ({ ...t, messages: t.messages.map((x) => (x.id === messageId ? { ...x, reverted: true } : x)) })),
    )
  }

  function removeThread(id: string) {
    viewRef.current?.dispatch({ effects: removeAnchor.of(id) })
    setThreads((ts) => ts.filter((t) => t.id !== id))
    if (activeId === id) setActiveId(null)
  }

  function onSplitterMove(e: PointerEvent<HTMLDivElement>) {
    const main = mainRef.current
    if (!dragging || !main) return
    const rect = main.getBoundingClientRect()
    const width = rect.width - THREADS_WIDTH - SPLITTER_WIDTH
    setSplit(clampSplit((e.clientX - rect.left) / width))
  }

  function focusThread(id: string) {
    const a = currentAnchor(id)
    setActiveId(id)
    if (!a) return
    const view = viewRef.current
    if (view && a.from < a.to) {
      view.dispatch({ selection: { anchor: a.from, head: a.to }, scrollIntoView: true })
    }
    const root = previewRef.current
    const r = root && sourceToDomRange(a, root, model.segments)
    r?.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return (
    <div className="app">
      <header>
        <strong>MAID</strong>
        {host ? (
          <span className="doc-name">
            {file.name}
            {file.dirty && <span className="dirty" title="Ungesicherte Änderungen"> ●</span>}
          </span>
        ) : (
          <span className="muted">Web-Vorschau ohne Dateizugriff</span>
        )}
        {file.error && (
          <span className="error">
            {file.error}
            <button className="link" onClick={file.clearError}>
              ×
            </button>
          </span>
        )}
      </header>
      <main
        ref={mainRef}
        className={dragging ? 'dragging' : undefined}
        style={{
          gridTemplateColumns: `minmax(0, ${split}fr) ${SPLITTER_WIDTH}px minmax(0, ${1 - split}fr) ${THREADS_WIDTH}px`,
        }}
      >
        <section className="pane manuscript">
          <h2>Manuskript</h2>
          <div className="editor" ref={editorHost} />
        </section>
        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          title="Ziehen zum Ändern der Breite, Doppelklick setzt zurück"
          onPointerDown={(e) => {
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            setDragging(true)
          }}
          onPointerMove={onSplitterMove}
          onPointerUp={() => {
            setDragging(false)
            saveSplit(split)
          }}
          onDoubleClick={() => {
            setSplit(0.5)
            saveSplit(0.5)
          }}
        />
        <section className="pane">
          <h2>Druckfahne</h2>
          <Preview ref={previewRef} model={model} onMouseUp={onPreviewMouseUp} />
        </section>
        <aside className={`pane threads ${activeId ? 'chat-open' : ''}`}>
          <h2>Kommentare</h2>
          <ThreadPanel
            doc={doc}
            anchors={anchors}
            threads={threads}
            activeId={activeId}
            busy={busy}
            aiAvailable={!!host}
            onOpen={focusThread}
            onClose={() => setActiveId(null)}
            onSend={send}
            onExecute={(id) => void askAi(id, 'execute')}
            onRevert={revert}
            onRemove={removeThread}
          />
        </aside>
      </main>

      {pending && (
        <div className="popover" style={{ left: pending.x, top: pending.y }}>
          <div className="src">
            Quelle [{pending.from}, {pending.to}): <code>{doc.slice(pending.from, pending.to)}</code>
          </div>
          <textarea
            autoFocus
            placeholder={host ? 'Was stört dich an der Stelle? (⌘↩ an die KI)' : 'Kommentar …'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) comment(!!host)
              if (e.key === 'Escape') setPending(null)
            }}
          />
          <div className="actions">
            <button onClick={() => setPending(null)}>Abbrechen</button>
            <button disabled={!draft.trim()} onClick={() => comment(false)}>
              Nur notieren
            </button>
            {host && (
              <button className="primary" disabled={!draft.trim()} onClick={() => comment(true)}>
                Mit KI besprechen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
