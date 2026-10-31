type Props = {
  autoSave: boolean
  hasPath: boolean
  dirty: boolean
  saving: boolean
  onToggle: () => void
}

/**
 * Zustand des Speicherns im Kopf des Manuskripts. Mit Auto-Speichern steht
 * dort „Auto“, sonst ein Punkt für Ungespeichertes. Klick schaltet um.
 */
export function SaveStatus({ autoSave, hasPath, dirty, saving, onToggle }: Props) {
  const auto = autoSave && hasPath
  const text = saving ? 'speichert …' : dirty ? (auto ? 'gleich gespeichert' : 'nicht gespeichert') : 'gespeichert'
  const title = autoSave
    ? `Automatisch speichern ist an${hasPath ? '' : ' – greift, sobald das Dokument einen Dateinamen hat (⌘S)'}. Klicken zum Ausschalten.`
    : 'Automatisch speichern ist aus – ⌘S speichert. Klicken zum Einschalten.'
  return (
    <button className={`save-status ${auto ? 'auto' : ''} ${dirty && !auto ? 'dirty' : ''}`} title={title} onClick={onToggle}>
      {autoSave && <span className="badge">Auto</span>}
      {dirty && !auto && <span className="dot">●</span>}
      {text}
    </button>
  )
}
