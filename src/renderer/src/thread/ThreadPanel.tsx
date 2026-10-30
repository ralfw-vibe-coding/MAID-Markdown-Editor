import { useEffect, useRef, useState } from 'react'
import type { Anchor } from '../anchor/anchors'
import { diffWords } from './diffWords'
import type { Message, Thread } from './thread'

type Props = {
  doc: string
  anchors: Anchor[]
  threads: Thread[]
  activeId: string | null
  busy: ReadonlySet<string>
  aiAvailable: boolean
  onFocus: (id: string) => void
  onSend: (id: string, text: string) => void
  onExecute: (id: string) => void
  onRevert: (id: string, messageId: string) => void
  onRemove: (id: string) => void
}

const STATUS_LABEL: Record<Anchor['status'], string> = { ok: 'verankert', geändert: 'Text geändert', verloren: 'Stelle verloren' }

export function ThreadPanel(props: Props) {
  const { anchors, threads, activeId } = props
  if (threads.length === 0) {
    return <p className="threads-empty muted">Text in der Druckfahne markieren, um einen Kommentar anzulegen.</p>
  }
  return (
    <>
      {threads.map((t) => {
        const anchor = anchors.find((a) => a.id === t.id)
        if (!anchor) return null
        return t.id === activeId ? (
          <ActiveThread key={t.id} {...props} thread={t} anchor={anchor} />
        ) : (
          <CollapsedThread key={t.id} doc={props.doc} thread={t} anchor={anchor} busy={props.busy.has(t.id)} onFocus={props.onFocus} />
        )
      })}
    </>
  )
}

function anchoredText(doc: string, a: Anchor) {
  return a.from < a.to ? doc.slice(a.from, a.to) : a.quote
}

function CollapsedThread({ doc, thread, anchor, busy, onFocus }: { doc: string; thread: Thread; anchor: Anchor; busy: boolean; onFocus: (id: string) => void }) {
  const last = [...thread.messages].reverse().find((m) => m.kind === 'user' || m.kind === 'ai')
  return (
    <article className="thread" onClick={() => onFocus(thread.id)}>
      <blockquote className={`anchor-${anchor.status}`}>{anchoredText(doc, anchor)}</blockquote>
      {last && 'text' in last && (
        <p className="snippet">
          <span className="who">{last.kind === 'ai' ? 'KI' : 'Du'}:</span> {last.text}
        </p>
      )}
      <div className="thread-meta muted">
        {thread.messages.length} {thread.messages.length === 1 ? 'Nachricht' : 'Nachrichten'}
        {busy && ' · KI denkt …'}
        {anchor.status !== 'ok' && ` · ${STATUS_LABEL[anchor.status]}`}
      </div>
    </article>
  )
}

function ActiveThread(props: Props & { thread: Thread; anchor: Anchor }) {
  const { doc, thread, anchor, aiAvailable, onSend, onExecute, onRevert, onRemove } = props
  const busy = props.busy.has(thread.id)
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [thread.messages.length, busy])

  const send = () => {
    if (!draft.trim() || busy) return
    onSend(thread.id, draft.trim())
    setDraft('')
  }
  // Die zuletzt ausgeführte Änderung kann im Thread zurückgenommen werden.
  const lastEdit = [...thread.messages].reverse().find((m) => m.kind === 'edit')

  return (
    <article className="thread active">
      <div className="thread-head">
        <span className={`status status-${anchor.status}`}>{STATUS_LABEL[anchor.status]}</span>
        <button className="link" onClick={() => onRemove(thread.id)}>
          Thread löschen
        </button>
      </div>
      <blockquote className={`anchor-${anchor.status}`}>{anchoredText(doc, anchor)}</blockquote>

      <div className="messages">
        {thread.messages.map((m) => {
          // Zurücknehmen geht nur, solange genau der eingesetzte Text an der Stelle steht.
          const current = m === lastEdit && m.kind === 'edit' && !m.reverted
          const intact = current && anchor.from < anchor.to && doc.slice(anchor.from, anchor.to) === m.after
          return (
            <MessageView
              key={m.id}
              m={m}
              canRevert={intact && !busy}
              editedSince={current && !intact}
              onRevert={() => onRevert(thread.id, m.id)}
            />
          )
        })}
        {busy && <div className="msg msg-ai thinking">KI denkt …</div>}
        <div ref={endRef} />
      </div>

      <textarea
        placeholder={aiAvailable ? 'Antworten … (⌘↩ senden)' : 'Notiz …'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            send()
          }
        }}
      />
      <div className="actions">
        <button
          title="Die besprochene Änderung jetzt im Manuskript ausführen"
          disabled={!aiAvailable || busy || anchor.status === 'verloren'}
          onClick={() => onExecute(thread.id)}
        >
          Umsetzen
        </button>
        <button className="primary" disabled={!draft.trim() || busy} onClick={send}>
          Senden
        </button>
      </div>
    </article>
  )
}

function MessageView({ m, canRevert, editedSince, onRevert }: { m: Message; canRevert: boolean; editedSince: boolean; onRevert: () => void }) {
  switch (m.kind) {
    case 'user':
      return <div className="msg msg-user">{m.text}</div>
    case 'ai':
      return <div className="msg msg-ai">{m.text}</div>
    case 'error':
      return <div className="msg msg-error">{m.text}</div>
    case 'edit':
      return (
        <div className={`msg msg-edit ${m.reverted ? 'reverted' : ''}`}>
          <div className="edit-head">
            <span>
              {m.reverted ? 'Änderung zurückgenommen' : editedSince ? 'Änderung ausgeführt · Stelle seitdem bearbeitet' : 'Änderung ausgeführt'}
            </span>
            {canRevert && (
              <button className="link" onClick={onRevert}>
                Zurücknehmen
              </button>
            )}
          </div>
          <div className="diff">
            {diffWords(m.before, m.after).map((p, i) =>
              p.type === 'same' ? <span key={i}>{p.text}</span> : p.type === 'del' ? <del key={i}>{p.text}</del> : <ins key={i}>{p.text}</ins>,
            )}
          </div>
        </div>
      )
  }
}
