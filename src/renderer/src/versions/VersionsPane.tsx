import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { ConfirmDeleteButton } from '../layout/ConfirmDeleteButton'
import { DiffView } from './DiffView'
import { formatWhen, timelinePositions } from './timeline'
import type { Version } from './versions'

type Props = {
  versions: Version[]
  /** Gewählte Version (Vergleich darunter); null = aktueller Stand. */
  selectedId: string | null
  current: string
  available: boolean
  /** Ändert sich, wenn das Nachrichtenfeld den Fokus bekommen soll (⌥⌘S). */
  focusToken: number
  onSave: (message: string) => Promise<void>
  onSuggest?: () => Promise<string>
  onSelect: (id: string | null) => void
  onRestore: (id: string) => void
  onRemove: (id: string) => void
}

/** Versionsspalte: oben sichern, dann Zeitstrahl und Liste zum Wählen, darunter der Vergleich. */
export function VersionsPane(props: Props) {
  const { versions, selectedId, current, available } = props
  const selected = versions.find((v) => v.id === selectedId)
  const previous = selected ? versions[versions.indexOf(selected) - 1] : undefined

  if (!available) return <p className="threads-empty muted">Versionen gibt es nur in der App.</p>
  return (
    <div className="versions-pane">
      <SaveForm {...props} />
      {versions.length === 0 ? (
        <p className="threads-empty muted">
          Noch keine Versionen. Eine Version sichert den jetzigen Stand mit einer Nachricht – du kannst später vergleichen und dahin zurückgehen.
        </p>
      ) : (
        <>
          <Timeline versions={versions} selectedId={selectedId} onSelect={props.onSelect} />
          <VersionList {...props} />
          {selected ? (
            <DiffView version={selected} previous={previous} current={current} onRestore={() => props.onRestore(selected.id)} onClose={() => props.onSelect(null)} />
          ) : (
            <p className="threads-empty muted">Eine Version im Zeitstrahl oder in der Liste wählen, um zu sehen, was sich geändert hat.</p>
          )}
        </>
      )}
    </div>
  )
}

function SaveForm({ focusToken, onSave, onSuggest }: Props) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'suggest' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focusToken) input.current?.focus()
  }, [focusToken])

  const run = async (kind: 'suggest' | 'save', f: () => Promise<void>) => {
    setBusy(kind)
    setError(null)
    try {
      await f()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const save = () =>
    message.trim() &&
    run('save', async () => {
      await onSave(message.trim())
      setMessage('')
    })

  return (
    <div className="version-save">
      <div className="version-save-row">
        <input
          ref={input}
          type="text"
          placeholder="Neue Version: Was hat sich geändert?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
        />
        {onSuggest && (
          <button
            className="icon"
            title="Nachricht von Claude vorschlagen lassen"
            aria-label="Vorschlag von Claude"
            disabled={busy !== null}
            onClick={() => void run('suggest', async () => setMessage(await onSuggest()))}
          >
            <Sparkles size={15} className={busy === 'suggest' ? 'spinning' : undefined} />
          </button>
        )}
        <button className="primary" disabled={!message.trim() || busy !== null} onClick={() => void save()}>
          Sichern
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}

/** Zeitstrahl: ein Punkt je Version, maßstäblich bis „jetzt“; Klick wählt. */
function Timeline({ versions, selectedId, onSelect }: { versions: Version[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const [now] = useState(() => Date.now())
  const positions = useMemo(() => timelinePositions(versions.map((v) => Date.parse(v.createdAt)), Math.max(now, Date.now())), [versions, now])
  const selectedIndex = versions.findIndex((v) => v.id === selectedId)
  return (
    <div className="timeline" aria-label="Zeitstrahl der Versionen">
      <div className="timeline-track">
        <div className="timeline-axis" />
        {selectedIndex >= 0 && (
          <div className="timeline-span" style={{ left: `${positions[selectedIndex] * 100}%`, right: 0 }} title="Zeitraum zwischen gewählter Version und jetzt" />
        )}
        {versions.map((v, i) => (
          <button
            key={v.id}
            className={`timeline-dot ${v.id === selectedId ? 'selected' : ''} ${v.auto ? 'auto' : ''}`}
            style={{ left: `${positions[i] * 100}%` }}
            title={`${v.message || '(ohne Nachricht)'} – ${formatWhen(v.createdAt)}`}
            aria-label={v.message}
            onClick={() => onSelect(v.id === selectedId ? null : v.id)}
          />
        ))}
        <button
          className={`timeline-now ${selectedId === null ? 'selected' : ''}`}
          style={{ left: '100%' }}
          title="Jetzt – aktueller Stand"
          aria-label="Jetzt"
          onClick={() => onSelect(null)}
        />
      </div>
      <div className="timeline-labels muted">
        <span>{formatWhen(versions[0].createdAt)}</span>
        <span>jetzt</span>
      </div>
    </div>
  )
}

function VersionList({ versions, selectedId, onSelect, onRemove }: Props) {
  const list = useRef<HTMLDivElement>(null)
  // Die gewählte Version in der Liste sichtbar halten (z. B. nach Klick im Zeitstrahl).
  useEffect(() => {
    list.current?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])
  return (
    <div className="version-list" ref={list}>
      {[...versions].reverse().map((v) => (
        <div key={v.id} className={`version-row ${v.id === selectedId ? 'selected' : ''} ${v.auto ? 'auto' : ''}`} onClick={() => onSelect(v.id === selectedId ? null : v.id)}>
          <span className="version-dot" />
          <span className="version-message">{v.message || '(ohne Nachricht)'}</span>
          <span className="version-meta">
            {formatWhen(v.createdAt)} · <span className="plus">+{v.added}</span> <span className="minus">−{v.removed}</span>
          </span>
          <ConfirmDeleteButton label="Version löschen" onDelete={() => onRemove(v.id)} />
        </div>
      ))}
    </div>
  )
}
