import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MessageSquarePlus, X } from 'lucide-react'
import { buildPreview } from '../render/buildPreview'
import { Preview } from '../render/Preview'
import { occursOnce } from '../thread/thread'
import { MessageView } from '../thread/ThreadPanel'
import { ConfirmDeleteButton } from '../layout/ConfirmDeleteButton'
import { UNTITLED, type Chat } from './chats'

type Props = {
  doc: string
  chats: Chat[]
  /** Geöffneter Chat; null zeigt die Liste aller Chats. */
  activeId: string | null
  busy: ReadonlySet<string>
  aiAvailable: boolean
  onNew: () => void
  onOpen: (id: string) => void
  onClose: () => void
  onSend: (id: string, text: string) => void
  onRevert: (id: string, messageId: string) => void
  onRename: (id: string, title: string) => void
  onRemove: (id: string) => void
}

/** Freie Chats mit Claude über das ganze Dokument: Liste oder geöffneter Chat. */
export function ChatPanel(props: Props) {
  const open = props.chats.find((c) => c.id === props.activeId)
  return open ? <ChatView {...props} chat={open} /> : <ChatList {...props} />
}

function ChatList({ chats, busy, aiAvailable, onNew, onOpen }: Props) {
  const shown = [...chats].filter((c) => c.messages.length > 0).reverse()
  return (
    <div className="thread-list chat-list">
      <button className="new-chat" disabled={!aiAvailable} onClick={onNew}>
        <MessageSquarePlus size={15} /> Neuer Chat
      </button>
      {!aiAvailable && <p className="threads-empty muted">Der Chat ist nur in der App verfügbar.</p>}
      {aiAvailable && shown.length === 0 && (
        <p className="threads-empty muted">Claude kennt das ganze Dokument und deine Markierung im Manuskript und ändert auf ausdrücklichen Auftrag.</p>
      )}
      {shown.map((c) => {
        const last = c.messages.findLast((m) => m.kind === 'user' || m.kind === 'ai')
        return (
          <article key={c.id} className="thread" onClick={() => onOpen(c.id)}>
            <div className="chat-title">{c.title || UNTITLED}</div>
            {last && 'text' in last && (
              <p className="snippet">
                <span className="who">{last.kind === 'ai' ? 'Claude' : 'Du'}:</span> {last.text}
              </p>
            )}
            <div className="thread-meta muted">
              {c.messages.length} {c.messages.length === 1 ? 'Nachricht' : 'Nachrichten'} · {new Date(c.createdAt).toLocaleDateString('de-DE')}
              {busy.has(c.id) && ' · Claude denkt …'}
            </div>
          </article>
        )
      })}
    </div>
  )
}

function ChatView(props: Props & { chat: Chat }) {
  const { doc, chat, aiAvailable, onClose, onSend, onRevert, onRename, onRemove } = props
  const busy = props.busy.has(chat.id)
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const messages = chat.messages

  // Der Verlauf steht immer am Ende.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.id, messages.length, busy])

  const lastEdit = messages.findLast((m) => m.kind === 'edit')

  const send = () => {
    if (!draft.trim() || busy || !aiAvailable) return
    onSend(chat.id, draft.trim())
    setDraft('')
  }

  return (
    <div
      className="chat global-chat"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) onClose()
      }}
    >
      <div className="chat-head">
        <ChatTitle chat={chat} onRename={(t) => onRename(chat.id, t)} />
        <span className="chat-tools">
          <ConfirmDeleteButton label="Chat löschen" onDelete={() => onRemove(chat.id)} />
          <button className="icon" title="Schließen (Esc)" aria-label="Chat schließen" onClick={onClose}>
            <X size={16} />
          </button>
        </span>
      </div>

      <div className="messages" ref={scroller}>
        {messages.length === 0 && (
          <p className="muted chat-empty">
            Frag Claude etwas zum Text – z. B. „Fasse den Text zusammen“ oder „Wo ist die Argumentation schwach?“. Mit einer Markierung im Manuskript und
            einem klaren Auftrag („kürz das“) ändert Claude auch.
          </p>
        )}
        {messages.map((m) =>
          m.kind === 'user' ? (
            <div key={m.id} className="msg msg-user">
              {m.text}
            </div>
          ) : m.kind === 'ai' ? (
            <MarkdownMessage key={m.id} text={m.text} />
          ) : m.kind === 'error' ? (
            <div key={m.id} className="msg msg-error">
              {m.text}
            </div>
          ) : (
            <MessageView
              key={m.id}
              m={m}
              showWhere={false}
              // Zurücknehmen geht, solange der eingesetzte Text eindeutig im Dokument steht.
              canRevert={m === lastEdit && !m.reverted && occursOnce(doc, m.after) && !busy}
              editedSince={m === lastEdit && !m.reverted && !occursOnce(doc, m.after)}
              onRevert={() => onRevert(chat.id, m.id)}
            />
          ),
        )}
        {busy && <div className="msg msg-ai thinking">Claude denkt …</div>}
      </div>

      <div className="composer">
        <textarea
          autoFocus
          placeholder="Nachricht an Claude … (↩ senden, ⇧↩ neue Zeile)"
          value={draft}
          disabled={!aiAvailable}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="actions">
          <button className="primary" disabled={!draft.trim() || busy || !aiAvailable} onClick={send}>
            Senden
          </button>
        </div>
      </div>
    </div>
  )
}

/** Titel des Chats; Klick zum Umbenennen, ↩ übernimmt, Esc bricht ab. */
function ChatTitle({ chat, onRename }: { chat: Chat; onRename: (title: string) => void }) {
  const [editing, setEditing] = useState(false)
  if (!editing) {
    return (
      <button className="chat-title editable" title="Klicken zum Umbenennen" onClick={() => setEditing(true)}>
        {chat.title || UNTITLED}
      </button>
    )
  }
  const commit = (value: string) => {
    if (!editing) return
    onRename(value)
    setEditing(false)
  }
  return (
    <input
      className="chat-title-input"
      autoFocus
      defaultValue={chat.title}
      placeholder={UNTITLED}
      onFocus={(e) => e.target.select()}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(e.currentTarget.value)
        if (e.key === 'Escape') setEditing(false)
      }}
    />
  )
}

function MarkdownMessage({ text }: { text: string }) {
  const model = useMemo(() => buildPreview(text), [text])
  return (
    <div className="msg msg-ai msg-markdown">
      <Preview model={model} className="markdown" />
    </div>
  )
}
