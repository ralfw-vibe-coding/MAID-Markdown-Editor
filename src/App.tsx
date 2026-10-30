import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { basicSetup } from 'codemirror'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { buildPreview } from './render/buildPreview'
import { Preview } from './render/Preview'
import { domRangeToSource, sourceToDomRange, type SourceRange } from './anchor/selection'
import { addAnchor, anchorField, createAnchor, removeAnchor, type Anchor } from './anchor/anchors'
import { sampleDoc } from './sampleDoc'

type Pending = SourceRange & { x: number; y: number }

export function App() {
  const editorHost = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [doc, setDoc] = useState(sampleDoc)
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const [draft, setDraft] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const model = useMemo(() => buildPreview(doc), [doc])

  useEffect(() => {
    const view = new EditorView({
      parent: editorHost.current!,
      doc: sampleDoc,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        anchorField,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) setDoc(u.state.doc.toString())
          const next = u.state.field(anchorField)
          if (next !== u.startState.field(anchorField)) setAnchors(next)
        }),
      ],
    })
    viewRef.current = view
    return () => view.destroy()
  }, [])

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

  function comment() {
    const view = viewRef.current
    if (!view || !pending || !draft.trim()) return
    const anchor = createAnchor(view.state.doc, pending.from, pending.to, draft.trim())
    view.dispatch({ effects: addAnchor.of(anchor) })
    setPending(null)
    setActiveId(anchor.id)
    window.getSelection()?.removeAllRanges()
  }

  function focusAnchor(a: Anchor) {
    setActiveId(a.id)
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
        <strong>MAID</strong> <span className="muted">Proof of Concept · Anker ohne KI</span>
      </header>
      <main>
        <section className="pane">
          <h2>Manuskript</h2>
          <div className="editor" ref={editorHost} />
        </section>
        <section className="pane">
          <h2>Druckfahne</h2>
          <Preview ref={previewRef} model={model} onMouseUp={onPreviewMouseUp} />
        </section>
        <aside className="pane threads">
          <h2>Kommentare</h2>
          {anchors.length === 0 && <p className="muted">Text in der Druckfahne markieren, um einen Kommentar anzulegen.</p>}
          {anchors.map((a) => (
            <article
              key={a.id}
              className={`thread ${a.id === activeId ? 'active' : ''}`}
              onClick={() => focusAnchor(a)}
            >
              <div className="thread-head">
                <span className={`status status-${a.status}`}>{a.status}</span>
                <button
                  className="link"
                  onClick={(e) => {
                    e.stopPropagation()
                    viewRef.current?.dispatch({ effects: removeAnchor.of(a.id) })
                  }}
                >
                  entfernen
                </button>
              </div>
              <blockquote>{a.from < a.to ? doc.slice(a.from, a.to) : a.quote}</blockquote>
              <p>{a.comment}</p>
              <code className="range">
                [{a.from}, {a.to})
              </code>
            </article>
          ))}
        </aside>
      </main>

      {pending && (
        <div className="popover" style={{ left: pending.x, top: pending.y }}>
          <div className="src">
            Quelle [{pending.from}, {pending.to}): <code>{doc.slice(pending.from, pending.to)}</code>
          </div>
          <textarea
            autoFocus
            placeholder="Kommentar …"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) comment()
              if (e.key === 'Escape') setPending(null)
            }}
          />
          <div className="actions">
            <button onClick={() => setPending(null)}>Abbrechen</button>
            <button className="primary" disabled={!draft.trim()} onClick={comment}>
              Kommentieren
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
