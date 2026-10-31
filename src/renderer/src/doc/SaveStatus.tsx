import { GitCommitHorizontal, Save } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** Minuten, die ein Klick auf das Fassungs-Symbol einschaltet. */
export const AUTO_COMMIT_DEFAULT = 15

type Props = {
  hasPath: boolean
  /** Speichern */
  autoSave: boolean
  dirty: boolean
  saving: boolean
  onToggleSave: () => void
  /** Fassungen: Minuten für automatisches Festhalten, 0 = aus */
  autoCommitMinutes: number
  /** Der Stand im Manuskript ist noch nicht als Fassung festgehalten. */
  unfixed: boolean
  onToggleCommit: () => void
}

/**
 * Zwei kleine Anzeigen im Kopf des Manuskripts: Diskette für Speichern,
 * Commit-Symbol für Fassungen – jeweils mit Punkt (rot = offen, grün = erledigt)
 * und „Auto“, wenn es automatisch geschieht. Klick schaltet „Auto“ um.
 */
export function SaveStatus(p: Props) {
  const autoCommit = p.autoCommitMinutes > 0
  return (
    <span className="status-indicators">
      <Indicator
        icon={Save}
        auto={p.autoSave}
        state={p.saving ? 'busy' : p.dirty ? 'open' : 'done'}
        title={[
          p.saving ? 'Speichert …' : p.dirty ? 'Nicht gespeichert' : 'Gespeichert',
          p.autoSave
            ? `Automatisch speichern ist an${p.hasPath ? '' : ' – greift, sobald das Dokument einen Dateinamen hat (⌘S)'}`
            : 'Automatisch speichern ist aus – ⌘S speichert',
          'Klicken zum Umschalten',
        ].join('\n')}
        onClick={p.onToggleSave}
      />
      <Indicator
        icon={GitCommitHorizontal}
        auto={autoCommit}
        state={p.unfixed ? 'open' : 'done'}
        title={[
          p.unfixed ? 'Noch nicht als Fassung festgehalten' : 'Als Fassung festgehalten',
          autoCommit ? `Automatisch alle ${p.autoCommitMinutes} Minuten festhalten` : 'Automatisches Festhalten ist aus – ⌥⌘S hält fest',
          `Klicken zum Umschalten (${AUTO_COMMIT_DEFAULT} Minuten ↔ aus)`,
        ].join('\n')}
        onClick={p.onToggleCommit}
      />
    </span>
  )
}

function Indicator({ icon: Icon, auto, state, title, onClick }: { icon: LucideIcon; auto: boolean; state: 'open' | 'done' | 'busy'; title: string; onClick: () => void }) {
  return (
    <button className="indicator" title={title} aria-label={title.split('\n')[0]} onClick={onClick}>
      {auto && <span className="badge">Auto</span>}
      <Icon size={13} />
      <span className={`state-dot ${state}`} />
    </button>
  )
}
