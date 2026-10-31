import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { ClaudeInfo, MaidHost, Settings } from '../../../shared/host'

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

const EDITOR_FONTS = ['SF Mono', 'Menlo', 'Monaco', 'JetBrains Mono', 'Fira Code', 'iA Writer Mono S', 'Courier New']
const PREVIEW_FONTS = ['Georgia', 'Iowan Old Style', 'Palatino', 'Charter', 'Baskerville', 'New York', 'Helvetica Neue', 'Avenir Next']

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
          <h4>Schrift</h4>
          <FontRow
            label="Manuskript"
            list="editor-fonts"
            fonts={EDITOR_FONTS}
            family={settings.editorFont}
            size={settings.editorFontSize}
            onChange={(family, size) => onChange({ editorFont: family, editorFontSize: size })}
          />
          <FontRow
            label="Druckfahne"
            list="preview-fonts"
            fonts={PREVIEW_FONTS}
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
  list: string
  fonts: string[]
  family: string
  size: number
  onChange: (family: string, size: number) => void
}) {
  const { label, list, fonts, family, size, onChange } = props
  return (
    <label>
      <span>{label}</span>
      <span className="font-row">
        <input type="text" list={list} placeholder="Standard" value={family} onChange={(e) => onChange(e.target.value, size)} />
        <datalist id={list}>
          {fonts.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
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
    </label>
  )
}
