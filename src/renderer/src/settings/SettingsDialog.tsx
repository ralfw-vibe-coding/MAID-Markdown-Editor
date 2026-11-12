import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { FontPicker } from './FontPicker'
import { asUpdateState, type ClaudeInfo, type MaidHost, type Settings, type UpdateState } from '../../../shared/host'

const MODELS = [
  { value: '', label: 'Standard der Claude CLI' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
]

const EFFORTS = [
  { value: '', label: 'Standard' },
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
  { value: 'xhigh', label: 'Sehr hoch' },
  { value: 'max', label: 'Maximal' },
]

// Vorschläge; angezeigt werden nur die tatsächlich installierten.
const EDITOR_FONTS = [
  'SF Mono', 'Menlo', 'Monaco', 'Courier New', 'Andale Mono', 'PT Mono',
  'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', 'Source Code Pro', 'iA Writer Mono S', 'iA Writer Duo S', 'Cascadia Code',
]
const PREVIEW_FONTS = [
  'Georgia', 'Iowan Old Style', 'Palatino', 'Charter', 'Baskerville', 'Hoefler Text', 'Big Caslon', 'Didot', 'Times New Roman',
  'New York', 'Literata', 'Source Serif 4', 'Merriweather',
  'Helvetica Neue', 'Avenir Next', 'Gill Sans', 'Optima', 'Futura', 'Seravek', 'Inter',
]
/** Schreibzeile beim Einschalten: etwas oberhalb der Mitte. */
const WRITING_LINE_DEFAULT = 40

const EDITOR_FALLBACK = 'ui-monospace, Menlo, monospace'
const PREVIEW_FALLBACK = 'Georgia, serif'

type Props = {
  host: MaidHost | null
  settings: Settings
  onChange: (changes: Partial<Settings>) => void
  onClose: () => void
}

export function SettingsDialog({ host, settings, onChange, onClose }: Props) {
  const [claude, setClaude] = useState<ClaudeInfo | 'prüft' | null>(null)

  const checkClaude = () => {
    if (!host) return
    setClaude('prüft')
    host.claudeInfo().then(setClaude)
  }
  // Beim Öffnen und nach Änderung des Pfads prüfen, welche CLI benutzt wird.
  useEffect(checkClaude, [host, settings.claudePath])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal settings"
        role="dialog"
        aria-label="Einstellungen"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="modal-head">
          <h3>Einstellungen</h3>
          <button className="icon" aria-label="Schließen" title="Schließen (Esc)" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <section>
          <h4>KI</h4>
          <label>
            <span>Modell</span>
            <select value={settings.model} onChange={(e) => onChange({ model: e.target.value })}>
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Denkaufwand</span>
            <select value={settings.effort} onChange={(e) => onChange({ effort: e.target.value })}>
              {EFFORTS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Claude CLI</span>
            <input
              type="text"
              placeholder="automatisch suchen"
              defaultValue={settings.claudePath}
              onBlur={(e) => e.target.value !== settings.claudePath && onChange({ claudePath: e.target.value.trim() })}
            />
          </label>
          <p className="hint">
            {claude === 'prüft' && 'Prüfe Claude CLI …'}
            {claude && claude !== 'prüft' && (claude.version ? `Benutzt: ${claude.path} (${claude.version})` : `Nicht startbar: ${claude.path} – ${claude.error}`)}
            {!host && 'Die KI ist nur in der App verfügbar.'}
          </p>
        </section>

        <section>
          <h4>Speichern & Fassungen</h4>
          <label>
            <span>Speichern</span>
            <span className="check-row">
              <input type="checkbox" checked={settings.autoSave} onChange={(e) => onChange({ autoSave: e.target.checked })} />
              automatisch nach kurzer Pause
            </span>
          </label>
          <label>
            <span>Fassungen</span>
            <span className="check-row">
              automatisch alle
              <input
                type="number"
                min={0}
                max={240}
                value={settings.autoCommitMinutes}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value))
                  if (n >= 0 && n <= 240) onChange({ autoCommitMinutes: n })
                }}
              />
              Minuten festhalten
            </span>
          </label>
          <p className="hint">Nur wenn sich etwas geändert hat; 0 = aus. Zeigt deinen Schreibfortschritt im Zeitstrahl.</p>
        </section>

        <section>
          <h4>Schreiben</h4>
          <label>
            <span>Schreibzeile</span>
            <span className="check-row">
              <input
                type="checkbox"
                checked={settings.writingLine > 0}
                onChange={(e) => onChange({ writingLine: e.target.checked ? WRITING_LINE_DEFAULT : 0 })}
              />
              festhalten
              {settings.writingLine > 0 && (
                <>
                  <input
                    type="range"
                    min={5}
                    max={90}
                    value={settings.writingLine}
                    aria-label="Höhe der Schreibzeile"
                    onChange={(e) => onChange({ writingLine: Number(e.target.value) })}
                  />
                  {settings.writingLine} % von oben
                </>
              )}
            </span>
          </label>
          <p className="hint">Beim Tippen bleibt die Cursorzeile auf dieser Höhe, der Text rückt nach. ⌥⌘T hält sie dort fest, wo der Cursor gerade steht.</p>
        </section>

        <UpdateSection host={host} />

        <section>
          <h4>Schrift</h4>
          <FontRow
            label="Manuskript"
            fonts={EDITOR_FONTS}
            fallback={EDITOR_FALLBACK}
            family={settings.editorFont}
            size={settings.editorFontSize}
            onChange={(family, size) => onChange({ editorFont: family, editorFontSize: size })}
          />
          <FontRow
            label="Druckfahne"
            fonts={PREVIEW_FONTS}
            fallback={PREVIEW_FALLBACK}
            family={settings.previewFont}
            size={settings.previewFontSize}
            onChange={(family, size) => onChange({ previewFont: family, previewFontSize: size })}
          />
          <p className="hint">Jede installierte Schrift ist möglich; leer = Standard.</p>
        </section>
      </div>
    </div>
  )
}

function FontRow(props: {
  label: string
  fonts: string[]
  fallback: string
  family: string
  size: number
  onChange: (family: string, size: number) => void
}) {
  const { label, fonts, fallback, family, size, onChange } = props
  // Kein <label>: ein Klick in die Schriftliste würde sonst das Eingabefeld fokussieren und die Liste wieder öffnen.
  return (
    <div className="field">
      <span>{label}</span>
      <span className="font-row">
        <FontPicker value={family} fonts={fonts} fallback={fallback} onChange={(f) => onChange(f, size)} />
        <input
          type="number"
          min={9}
          max={32}
          value={size}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (n >= 9 && n <= 32) onChange(family, n)
          }}
        />
        <span className="unit">px</span>
      </span>
    </div>
  )
}

/**
 * Aktualisierung aus einem Ordner (meist ein geteilter Dropbox-Ordner). Nur in
 * der installierten App; MAID aus dem Repo und die Web-Vorschau zeigen nichts.
 */
function UpdateSection({ host }: { host: MaidHost | null }) {
  const [update, setUpdate] = useState<UpdateState>({ state: 'unavailable' })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!host) return
    void host.updateState().then((s) => setUpdate(asUpdateState(s)))
    return host.onUpdate((s) => setUpdate(asUpdateState(s)))
  }, [host])
  if (!host || update.state === 'unavailable') return null

  const act = (f: () => Promise<UpdateState>) => {
    setBusy(true)
    void f()
      .then((s) => setUpdate(asUpdateState(s)))
      .finally(() => setBusy(false))
  }
  const folder = update.state === 'off' ? null : update.folder
  const installing = update.state === 'installing'

  return (
    <section>
      <h4>Aktualisierung</h4>
      <div className="field">
        <span>Update-Ordner</span>
        <span className="update-row">
          <button disabled={busy || installing} onClick={() => act(() => host.updateFolder(true))}>
            Ordner wählen …
          </button>
          <button disabled={busy || installing || !folder} onClick={() => act(() => host.checkForUpdate())}>
            Jetzt prüfen
          </button>
          <button disabled={busy || installing || !folder} onClick={() => act(() => host.updateFolder(null))}>
            Update-Ordner entfernen
          </button>
        </span>
      </div>
      <p className="hint update-status">
        {busy && !installing ? 'Prüfe …' : <UpdateStatus update={update} onInstall={() => act(() => host.installUpdate())} />}
      </p>
      {folder && (
        <p className="hint update-folder" title={folder}>
          {folder}
        </p>
      )}
    </section>
  )
}

function UpdateStatus({ update, onInstall }: { update: UpdateState; onInstall: () => void }) {
  switch (update.state) {
    case 'unavailable':
      return null
    case 'off':
      return <>Build {update.build}. Wähle einen Ordner, in dem neue Builds als ZIP liegen (z. B. einen geteilten Dropbox-Ordner).</>
    case 'current':
      return <>Build {update.build} ist aktuell{update.checked ? ` · geprüft ${clock(update.checked)}` : ''}.</>
    case 'available':
      return (
        <>
          Build {update.offer.build} ist da ·{' '}
          <button className="link" onClick={onInstall}>
            Jetzt aktualisieren
          </button>
          <span className="muted"> (läuft: Build {update.build})</span>
        </>
      )
    case 'installing':
      return <>Build {update.offer.build} wird installiert – MAID beendet sich und startet neu …</>
    case 'failed':
      return <span className="error">{update.message}</span>
  }
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
