import { GitCommitHorizontal } from 'lucide-react'
import { ConfirmDeleteButton } from '../layout/ConfirmDeleteButton'
import type { Version } from './versions'

type Props = {
  versions: Version[]
  /** Version, deren Vergleich gerade in der Druckfahne steht. */
  shownId: string | null
  available: boolean
  onSave: () => void
  onShow: (id: string) => void
  onRemove: (id: string) => void
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Liste der gesicherten Versionen, neueste zuerst. */
export function VersionsPanel({ versions, shownId, available, onSave, onShow, onRemove }: Props) {
  return (
    <div className="thread-list versions-list">
      <button className="new-chat" disabled={!available} onClick={onSave} title="Ablage › Version sichern … (⌥⌘S)">
        <GitCommitHorizontal size={15} /> Version sichern
      </button>
      {!available && <p className="threads-empty muted">Versionen gibt es nur in der App.</p>}
      {available && versions.length === 0 && (
        <p className="threads-empty muted">Noch keine Versionen. Eine Version sichert den jetzigen Stand mit einer Nachricht – du kannst später vergleichen und dahin zurückgehen.</p>
      )}
      {[...versions].reverse().map((v) => (
        <article key={v.id} className={`thread version ${v.id === shownId ? 'shown' : ''} ${v.auto ? 'auto' : ''}`} onClick={() => onShow(v.id)}>
          <div className="version-head">
            <span className="chat-title">{v.message || '(ohne Nachricht)'}</span>
            <ConfirmDeleteButton label="Version löschen" onDelete={() => onRemove(v.id)} />
          </div>
          <div className="thread-meta muted">
            {when(v.createdAt)} · <span className="plus">+{v.added}</span> <span className="minus">−{v.removed}</span> Wörter
          </div>
        </article>
      ))}
    </div>
  )
}
