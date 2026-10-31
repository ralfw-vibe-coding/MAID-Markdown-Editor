import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'

type Props = {
  /** Vorschlag von Claude; fehlt, wenn die KI nicht verfügbar ist. */
  onSuggest?: () => Promise<string>
  onSave: (message: string) => void
  onClose: () => void
}

/** Kleines Fenster: Nachricht für eine neue Version eingeben (wie eine Commit-Nachricht). */
export function SaveVersionDialog({ onSuggest, onSave, onClose }: Props) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const suggest = async () => {
    if (!onSuggest) return
    setBusy(true)
    setError(null)
    try {
      setMessage(await onSuggest())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const save = () => message.trim() && onSave(message.trim())

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal save-version" role="dialog" aria-label="Version sichern" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="modal-head">
          <h3>Version sichern</h3>
          <button className="icon" aria-label="Schließen" title="Schließen (Esc)" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <p className="hint-text">Sichert den jetzigen Stand des Manuskripts. Du kannst später dahin zurückgehen oder vergleichen.</p>
        <input
          autoFocus
          type="text"
          placeholder="Was hat sich geändert?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        {error && <p className="error-text">{error}</p>}
        <div className="actions">
          {onSuggest && (
            <button className="suggest" disabled={busy} onClick={() => void suggest()}>
              <Sparkles size={14} /> {busy ? 'Claude überlegt …' : 'Vorschlag von Claude'}
            </button>
          )}
          <button className="primary" disabled={!message.trim()} onClick={save}>
            Sichern
          </button>
        </div>
      </div>
    </div>
  )
}
