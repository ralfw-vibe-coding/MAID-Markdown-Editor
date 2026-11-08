import { useLayoutEffect, useRef, useState } from 'react'
import { GitCommitHorizontal, X } from 'lucide-react'
import { ConfirmDeleteButton } from '../layout/ConfirmDeleteButton'
import type { Anchor } from '../anchor/anchors'
import { diffWords } from './diffWords'
import { checkedAtAnchor, lastEdits, occursOnce, type Message, type Thread } from './thread'

type Props = {
  doc: string
  anchors: Anchor[]
  threads: Thread[]
  /** Geöffneter Thread; null zeigt die Liste aller Threads. */
  activeId: string | null
  busy: ReadonlySet<string>
  aiAvailable: boolean
  onOpen: (id: string) => void
  onClose: () => void
  onSend: (id: string, text: string) => void
  onExecute: (id: string) => void
  onRevert: (id: string, messageId: string) => void
  onRemove: (id: string) => void
}

const STATUS_LABEL: Record<Anchor['status'], string> = { ok: 'verankert', geändert: 'Text geändert', verloren: 'Stelle verloren' }

/** Kommentarspalte: Liste aller Threads oder – wenn einer geöffnet ist – dessen Chat. */
export function ThreadPanel(props: Props) {
  const { anchors, threads, activeId } = props
  const open = threads.find((t) => t.id === activeId)
  const openAnchor = open && anchors.find((a) => a.id === open.id)
  if (open && openAnchor) return <Chat {...props} thread={open} anchor={openAnchor} />

  if (threads.length === 0) {
    return <p className="threads-empty muted">Text in der Druckfahne markieren, um einen Kommentar anzulegen.</p>
  }
  return (
    <div className="thread-list">
      {threads.map((t) => {
        const anchor = anchors.find((a) => a.id === t.id)
        return anchor ? <ThreadCard key={t.id} doc={props.doc} thread={t} anchor={anchor} busy={props.busy.has(t.id)} onOpen={props.onOpen} /> : null
      })}
    </div>
  )
}

function anchoredText(doc: string, a: Anchor) {
  if (a.point) {
    // Einfügemarke: etwas Text davor und danach zeigen, die Marke als ▍.
    const before = doc.slice(Math.max(0, a.from - 40), a.from).replace(/\s+/g, ' ')
    const after = doc.slice(a.from, a.from + 40).replace(/\s+/g, ' ')
    return `${a.from > 40 ? '…' : ''}${before}▍${after}${a.from + 40 < doc.length ? '…' : ''}`
  }
  return a.from < a.to ? doc.slice(a.from, a.to) : a.quote
}

const statusLabel = (a: Anchor) => (a.point ? 'Einfügemarke' : STATUS_LABEL[a.status])

function ThreadCard({ doc, thread, anchor, busy, onOpen }: { doc: string; thread: Thread; anchor: Anchor; busy: boolean; onOpen: (id: string) => void }) {
  const last = [...thread.messages].reverse().find((m) => m.kind === 'user' || m.kind === 'ai')
  return (
    <article className="thread" onClick={() => onOpen(thread.id)}>
      <blockquote className={`anchor-${anchor.status}`}>{anchoredText(doc, anchor)}</blockquote>
      {last && 'text' in last && (
        <p className="snippet">
          <span className="who">{last.kind === 'ai' ? 'KI' : 'Du'}:</span> {last.text}
        </p>
      )}
      <div className="thread-meta muted">
        {thread.messages.length} {thread.messages.length === 1 ? 'Nachricht' : 'Nachrichten'}
        {busy && ' · KI denkt …'}
        {(anchor.point || anchor.status !== 'ok') && ` · ${statusLabel(anchor)}`}
      </div>
    </article>
  )
}

function Chat(props: Props & { thread: Thread; anchor: Anchor }) {
  const { doc, thread, anchor, aiAvailable, onClose, onSend, onExecute, onRevert, onRemove } = props
  const busy = props.busy.has(thread.id)
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)

  // Der Verlauf steht immer am Ende – beim Öffnen und bei jeder neuen Nachricht.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread.id, thread.messages.length, busy])

  const send = () => {
    if (!draft.trim() || busy) return
    onSend(thread.id, draft.trim())
    setDraft('')
  }
  // Die zuletzt ausgeführte Änderung kann im Thread zurückgenommen werden.
  // Zurücknehmen geht für die Änderungen der letzten Antwort, die etwas geändert hat.
  const batch = lastEdits(thread.messages)

  return (
    <div
      className="chat"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="chat-head">
        <span className={`status status-${anchor.point ? 'point' : anchor.status}`}>{statusLabel(anchor)}</span>
        <span className="chat-tools">
          <ConfirmDeleteButton label="Thread löschen" onDelete={() => onRemove(thread.id)} />
          <button className="icon" title="Schließen (Esc)" aria-label="Thread schließen" onClick={onClose}>
            <X size={16} />
          </button>
        </span>
      </div>
      <blockquote className={`anchor-${anchor.status}`}>{anchoredText(doc, anchor)}</blockquote>

      <div className="messages" ref={scroller}>
        {thread.messages.map((m) => {
          // … und nur, solange genau der eingesetzte Text an der Stelle steht.
          const current = m.kind === 'edit' && !m.reverted && batch.includes(m)
          const intact =
            current &&
            (checkedAtAnchor(m, batch)
              ? (anchor.from < anchor.to || !!anchor.point) && doc.slice(anchor.from, anchor.to) === m.after
              : occursOnce(doc, m.after))
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
      </div>

      <div className="composer">
        <textarea
          autoFocus
          placeholder={aiAvailable ? 'Antworten … (↩ senden, ⇧↩ neue Zeile)' : 'Notiz … (↩ senden, ⇧↩ neue Zeile)'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Wie im Chat: ↩ sendet, ⇧↩ macht eine neue Zeile.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
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
      </div>
    </div>
  )
}

/** Eine Nachricht im Verlauf; Änderungen als Diff-Karte mit „Zurücknehmen“. */
export function MessageView(props: { m: Message; canRevert: boolean; editedSince: boolean; onRevert: () => void; showWhere?: boolean }) {
  const { m, canRevert, editedSince, onRevert, showWhere = true } = props
  switch (m.kind) {
    case 'user':
      return <div className="msg msg-user">{m.text}</div>
    case 'ai':
      return <div className="msg msg-ai">{m.text}</div>
    case 'error':
      return <div className="msg msg-error">{m.text}</div>
    case 'fassung':
      return (
        <div className="msg msg-fassung" title="Zu sehen in der Spalte „Fassungen“">
          <GitCommitHorizontal size={13} />
          <span>
            {m.existing ? 'Stand war schon festgehalten' : 'Fassung festgehalten'}: <strong>{m.title}</strong>
          </span>
        </div>
      )
    case 'edit':
      return (
        <div className={`msg msg-edit ${m.reverted ? 'reverted' : ''}`}>
          <div className="edit-head">
            <span>
              {m.reverted ? 'Änderung zurückgenommen' : editedSince ? 'Änderung ausgeführt · Stelle seitdem bearbeitet' : 'Änderung ausgeführt'}
              {m.elsewhere && showWhere && ' · an anderer Stelle'}
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
