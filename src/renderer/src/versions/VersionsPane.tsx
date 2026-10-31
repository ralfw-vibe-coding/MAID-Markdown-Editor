import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { ConfirmDeleteButton } from '../layout/ConfirmDeleteButton'
import { DiffView } from './DiffView'
import { Timeline } from './Timeline'
import { formatWhen } from './timeWindow'
import { wordStats, type Version } from './versions'

type Props = {
  versions: Version[]
  /** Gewählte Version (zeigt, was sie geändert hat); null = „Aktueller Stand“ (zeigt Ungesichertes). */
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

/**
 * Versionsspalte: oben sichern, dann Zeitstrahl und Liste zum Wählen, darunter
 * der Vergleich – für eine gewählte Version ihre Änderungen gegenüber der
 * vorherigen, für den „Aktuellen Stand“ das noch nicht Gesicherte seit der
 * neuesten Version. Der Aktuelle Stand steht wie eine Version oben in der
 * Liste, ist aber als ungesichert gekennzeichnet.
 */
export function VersionsPane(props: Props) {
  const { versions, selectedId, current, available } = props
  const selected = versions.find((v) => v.id === selectedId)
  const previous = selected ? versions[versions.indexOf(selected) - 1] : undefined
  const latest = versions.at(-1)

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
          <VersionList {...props} unsaved={latest ? latest.text !== current : false} latestText={latest?.text ?? ''} />
          {selected ? (
            <DiffView
              title={selected.message || '(ohne Nachricht)'}
              meta={formatWhen(selected.createdAt)}
              legend={previous ? 'Was diese Version gegenüber der vorherigen geändert hat' : 'Erste Version'}
              before={previous?.text ?? ''}
              after={selected.text}
              emptyText="Diese Version hat nichts geändert."
              restoreLabel="Zurück zu dieser Version"
              restoreTitle="Manuskript auf diese Version zurücksetzen (vorher wird der jetzige Stand gesichert)"
              onRestore={selected.text === current ? undefined : () => props.onRestore(selected.id)}
              onClose={() => props.onSelect(null)}
            />
          ) : (
            latest && (
              <DiffView
                title="Aktueller Stand"
                meta="nicht gesichert"
                legend={`Änderungen seit „${latest.message || 'letzte Version'}“`}
                before={latest.text}
                after={current}
                emptyText="Alles ist als Version gesichert."
                restoreLabel="Änderungen verwerfen"
                restoreTitle={`Zurück zu „${latest.message}“ – der jetzige Stand wird vorher als Version gesichert`}
                onRestore={latest.text === current ? undefined : () => props.onRestore(latest.id)}
              />
            )
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

function VersionList({ versions, selectedId, current, unsaved, latestText, onSelect, onRemove }: Props & { unsaved: boolean; latestText: string }) {
  const list = useRef<HTMLDivElement>(null)
  // Statistik des Aktuellen Stands gegenüber der neuesten Version (absatzweise, also auch bei langen Texten schnell).
  const stats = useMemo(() => (unsaved ? wordStats(latestText, current) : null), [unsaved, latestText, current])
  // Die gewählte Version in der Liste sichtbar halten (z. B. nach Klick im Zeitstrahl).
  useEffect(() => {
    list.current?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])
  return (
    <div className="version-list" ref={list}>
      <div className={`version-row current ${selectedId === null ? 'selected' : ''}`} onClick={() => onSelect(null)} title="Der Stand im Manuskript – noch keine Version">
        <span className="version-dot" />
        <span className="version-message">Aktueller Stand</span>
        <span className="version-meta">
          {stats ? (
            <>
              nicht gesichert · <span className="plus">+{stats.added}</span> <span className="minus">−{stats.removed}</span>
            </>
          ) : (
            'alles gesichert'
          )}
        </span>
        <span />
      </div>
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
