import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { ConfirmDeleteButton } from '../layout/ConfirmDeleteButton'
import { EditableTitle } from '../layout/EditableTitle'
import { DiffView } from './DiffView'
import { Timeline } from './Timeline'
import { formatWhen } from './timeWindow'
import { fassungTitle, wordStats, type Version } from './versions'

type Props = {
  versions: Version[]
  /** Gewählte Version (zeigt, was sie geändert hat); null = „Aktueller Stand“ (zeigt Ungesichertes). */
  selectedId: string | null
  current: string
  available: boolean
  /** Ändert sich, wenn das Bezeichnungsfeld den Fokus bekommen soll (⌥⌘S). */
  focusToken: number
  /** Leere Bezeichnung: Claude formuliert sie aus dem inhaltlichen Kern der Änderungen. */
  onSave: (message: string) => Promise<void>
  /** Vorschlag von Claude ins Feld holen – zum Übernehmen oder Ändern. */
  onSuggest?: () => Promise<string>
  aiAvailable: boolean
  onSelect: (id: string | null) => void
  onRestore: (id: string) => void
  onRename: (id: string, message: string) => void
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

  if (!available) return <p className="threads-empty muted">Fassungen gibt es nur in der App.</p>
  return (
    <div className="versions-pane">
      <SaveForm {...props} />
      {versions.length === 0 ? (
        <p className="threads-empty muted">
          Noch keine Fassungen. „Festhalten“ hält den jetzigen Stand als Fassung fest – du kannst später vergleichen und dahin zurückgehen.
        </p>
      ) : (
        <>
          <Timeline versions={versions} selectedId={selectedId} onSelect={props.onSelect} />
          <VersionList {...props} unsaved={latest ? latest.text !== current : false} latestText={latest?.text ?? ''} />
          {selected ? (
            <DiffView
              title={fassungTitle(selected)}
              rawTitle={selected.message}
              onRename={(m) => props.onRename(selected.id, m)}
              meta={formatWhen(selected.createdAt)}
              legend={previous ? 'Was diese Fassung gegenüber der vorherigen geändert hat' : 'Erste Fassung'}
              before={previous?.text ?? ''}
              after={selected.text}
              emptyText="Diese Fassung hat nichts geändert."
              restoreLabel="Zurück zu dieser Fassung"
              restoreTitle="Manuskript auf diese Fassung zurücksetzen (vorher wird der jetzige Stand festgehalten)"
              onRestore={selected.text === current ? undefined : () => props.onRestore(selected.id)}
              onClose={() => props.onSelect(null)}
            />
          ) : (
            latest && (
              <DiffView
                title="Aktueller Stand"
                meta="nicht festgehalten"
                legend={`Änderungen seit „${fassungTitle(latest)}“`}
                before={latest.text}
                after={current}
                emptyText="Alles ist als Fassung festgehalten."
                restoreLabel="Änderungen verwerfen"
                restoreTitle={`Zurück zu „${fassungTitle(latest)}“ – der jetzige Stand wird vorher festgehalten`}
                onRestore={latest.text === current ? undefined : () => props.onRestore(latest.id)}
              />
            )
          )}
        </>
      )}
    </div>
  )
}

function SaveForm({ focusToken, onSave, onSuggest, aiAvailable }: Props) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'suggest' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focusToken) input.current?.focus()
  }, [focusToken])

  const run = async (kind: 'suggest' | 'save', f: () => Promise<void>) => {
    if (busy) return
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
  // Leere Bezeichnung: Claude benennt die Fassung beim Festhalten selbst.
  const save = () =>
    run('save', async () => {
      await onSave(message.trim())
      setMessage('')
    })
  const suggest = () =>
    onSuggest &&
    run('suggest', async () => {
      setMessage(await onSuggest())
      input.current?.focus()
    })

  return (
    <div className="version-save">
      <div className="version-save-row">
        <input
          ref={input}
          type="text"
          placeholder={aiAvailable ? 'Bezeichnung – leer: Claude formuliert sie' : 'Bezeichnung der Fassung'}
          value={message}
          disabled={busy !== null}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
        />
        {onSuggest && (
          <button
            className="icon"
            title="Bezeichnung von Claude vorschlagen lassen – zum Übernehmen oder Ändern"
            aria-label="Vorschlag von Claude"
            disabled={busy !== null}
            onClick={() => void suggest()}
          >
            <Sparkles size={15} className={busy === 'suggest' ? 'spinning' : undefined} />
          </button>
        )}
        <button className="primary" disabled={busy !== null || (!message.trim() && !aiAvailable)} onClick={() => void save()} title="Jetzigen Stand als Fassung festhalten (⌥⌘S)">
          {busy === 'save' && !message.trim() ? 'Claude benennt …' : 'Festhalten'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}

function VersionList({ versions, selectedId, current, unsaved, latestText, onSelect, onRename, onRemove }: Props & { unsaved: boolean; latestText: string }) {
  const list = useRef<HTMLDivElement>(null)
  // Statistik des Aktuellen Stands gegenüber der neuesten Version (absatzweise, also auch bei langen Texten schnell).
  const stats = useMemo(() => (unsaved ? wordStats(latestText, current) : null), [unsaved, latestText, current])
  // Die gewählte Version in der Liste sichtbar halten (z. B. nach Klick im Zeitstrahl).
  useEffect(() => {
    list.current?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])
  return (
    <div className="version-list" ref={list}>
      <div className={`version-row current ${selectedId === null ? 'selected' : ''}`} onClick={() => onSelect(null)} title="Der Stand im Manuskript – noch nicht festgehalten">
        <span className="version-dot" />
        <span className="version-message">Aktueller Stand</span>
        <span className="version-meta">
          {stats ? (
            <>
              nicht festgehalten · <span className="plus">+{stats.added}</span> <span className="minus">−{stats.removed}</span>
            </>
          ) : (
            'alles festgehalten'
          )}
        </span>
        <span />
      </div>
      {[...versions].reverse().map((v) => (
        <div key={v.id} className={`version-row ${v.id === selectedId ? 'selected' : ''} ${v.auto ? 'auto' : ''}`} onClick={() => onSelect(v.id === selectedId ? null : v.id)}>
          <span className="version-dot" />
          <EditableTitle className="version-message" value={v.message} placeholder={fassungTitle(v)} trigger="dblclick" onRename={(m) => onRename(v.id, m)} />
          <span className="version-meta">
            {formatWhen(v.createdAt)} · <span className="plus">+{v.added}</span> <span className="minus">−{v.removed}</span>
          </span>
          <ConfirmDeleteButton label="Fassung löschen" onDelete={() => onRemove(v.id)} />
        </div>
      ))}
    </div>
  )
}
