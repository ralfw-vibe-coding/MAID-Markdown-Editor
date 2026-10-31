import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SquarePen } from 'lucide-react'
import { buildPreview } from '../render/buildPreview'
import { Preview } from '../render/Preview'
import { occursOnce, type Message } from '../thread/thread'
import { MessageView } from '../thread/ThreadPanel'

type Props = {
  doc: string
  messages: Message[]
  busy: boolean
  aiAvailable: boolean
  onSend: (text: string) => void
  onRevert: (messageId: string) => void
  onReset: () => void
}

/** Freier Chat mit Claude über das ganze Dokument. */
export function ChatPanel({ doc, messages, busy, aiAvailable, onSend, onRevert, onReset }: Props) {
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  // Der Verlauf steht immer am Ende.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, busy])

  const lastEdit = messages.findLast((m) => m.kind === 'edit')

  const send = () => {
    if (!draft.trim() || busy || !aiAvailable) return
    onSend(draft.trim())
    setDraft('')
  }

  return (
    <div className="chat global-chat">
      <div className="chat-head">
        <span className="muted">Claude kennt das ganze Dokument und deine Markierung; ändert auf ausdrücklichen Auftrag.</span>
        <span className="chat-tools">
          <button
            className="icon"
            title="Neuer Chat"
            aria-label="Neuer Chat"
            disabled={messages.length === 0 || busy}
            onClick={() => {
              onReset()
              input.current?.focus()
            }}
          >
            <SquarePen size={15} />
          </button>
        </span>
      </div>

      <div className="messages" ref={scroller}>
        {messages.length === 0 && (
          <p className="muted chat-empty">
            {aiAvailable ? 'Frag Claude etwas zum Text – z. B. „Fasse den Text zusammen“ oder „Wo ist die Argumentation schwach?“' : 'Der Chat ist nur in der App verfügbar.'}
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
              onRevert={() => onRevert(m.id)}
            />
          ),
        )}
        {busy && <div className="msg msg-ai thinking">Claude denkt …</div>}
      </div>

      <div className="composer">
        <textarea
          ref={input}
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

function MarkdownMessage({ text }: { text: string }) {
  const model = useMemo(() => buildPreview(text), [text])
  return (
    <div className="msg msg-ai msg-markdown">
      <Preview model={model} className="markdown" />
    </div>
  )
}
