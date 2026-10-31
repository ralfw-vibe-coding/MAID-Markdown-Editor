import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type MaidHost, type Settings } from '../../../shared/host'

const EDITOR_FALLBACK = 'ui-monospace, Menlo, monospace'
const PREVIEW_FALLBACK = "Georgia, 'Times New Roman', serif"

/** Überträgt die Schrift-Einstellungen als CSS-Variablen auf die Oberfläche. */
function applyFonts(s: Settings) {
  const root = document.documentElement.style
  root.setProperty('--editor-font', s.editorFont.trim() ? `${s.editorFont}, ${EDITOR_FALLBACK}` : EDITOR_FALLBACK)
  root.setProperty('--editor-size', `${s.editorFontSize}px`)
  root.setProperty('--preview-font', s.previewFont.trim() ? `${s.previewFont}, ${PREVIEW_FALLBACK}` : PREVIEW_FALLBACK)
  root.setProperty('--preview-size', `${s.previewFontSize}px`)
}

/** Einstellungen aus dem Hauptprozess; Änderungen werden sofort gespeichert und angewendet. */
export function useSettings(host: MaidHost | null) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  useEffect(() => {
    host?.getSettings().then(setSettings)
  }, [host])

  useEffect(() => applyFonts(settings), [settings])

  async function update(changes: Partial<Settings>) {
    // Sofort anwenden; die Antwort des Hauptprozesses nicht zurückschreiben,
    // sonst überholt beim schnellen Tippen eine ältere Antwort neuere Eingaben.
    setSettings((s) => ({ ...s, ...changes }))
    await host?.setSettings(changes)
  }

  return { settings, update }
}
