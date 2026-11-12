/** Schnittstelle zwischen Oberfläche (Renderer) und Hauptprozess, bereitgestellt vom Preload-Skript als `window.maid`. */

export type OpenedFile = {
  path: string
  content: string
  /** Inhalt der Begleitdatei `<datei>.maid.json`, falls vorhanden. */
  sidecar: string | null
}

/** Formatierungen im Manuskript (Menü „Format“, Tastenkürzel, Symbolleiste). */
export type FormatCommand = 'bold' | 'italic' | 'underline' | 'strike' | 'highlight' | 'link'

export type MenuCommand = 'new' | 'open' | 'save' | 'saveAs' | 'saveAndClose' | 'askAi' | 'chat' | 'settings' | 'saveVersion' | 'writingLine' | `format:${FormatCommand}` | `find:${FindCommand}`

/** Suchen und Ersetzen im Manuskript. */
export type FindCommand = 'open' | 'replace' | 'next' | 'previous'

/** Textmodus: Dokumente mit der Endung .txt sind reiner Text, kein Markdown. */
export const isPlainTextPath = (path: string | null) => !!path && /\.txt$/i.test(path)

export type DiscardChoice = 'save' | 'discard' | 'cancel'

/** Was das Fenster über sein Dokument wissen muss (Titel, Rückfrage, Wiederverwendung). */
export type DocumentState = { path: string | null; dirty: boolean; empty: boolean }

export type AiRequest = {
  prompt: string
  systemPrompt: string
  /** JSON-Schema der erwarteten Antwort. */
  schema: object
}

/** Einstellungen, gespeichert unter ~/Library/Application Support/MAID/settings.json. */
export type Settings = {
  /** Pfad zur Claude CLI; leer = automatisch suchen. */
  claudePath: string
  /** Modell für die KI, z. B. „opus“; leer = Standard der Claude CLI. */
  model: string
  /** Denkaufwand (low … max); leer = Standard. */
  effort: string
  /** CSS-Schriftfamilie des Manuskripts; leer = Standard. */
  editorFont: string
  editorFontSize: number
  /** CSS-Schriftfamilie der Druckfahne; leer = Standard. */
  previewFont: string
  previewFontSize: number
  /** Nach kurzer Tipppause, beim Wechsel in ein anderes Programm und beim Schließen speichern. */
  autoSave: boolean
  /** Alle so viele Minuten eine Fassung festhalten, wenn sich etwas geändert hat; 0 = aus. */
  autoCommitMinutes: number
  /** Schreibzeile: Höhe der Cursorzeile beim Tippen in Prozent des Manuskripts; 0 = aus. */
  writingLine: number
}

export const DEFAULT_SETTINGS: Settings = {
  claudePath: '',
  model: '',
  effort: '',
  editorFont: '',
  editorFontSize: 14,
  previewFont: '',
  previewFontSize: 17,
  autoSave: true,
  autoCommitMinutes: 15,
  writingLine: 0,
}

/** Ein neuerer Build im Update-Ordner. */
export type UpdateOffer = { version: string; build: number; commit?: string; file: string }

/**
 * Aktualisierung aus einem Ordner (z. B. einem geteilten Dropbox-Ordner).
 * `build` ist der laufende Build. „unavailable“: MAID aus dem Repo oder
 * die Web-Vorschau – die aktualisieren sich nicht.
 */
export type UpdateState =
  | { state: 'unavailable' }
  | { state: 'off'; build: number }
  | { state: 'current'; build: number; folder: string; checked: string }
  | { state: 'available'; build: number; folder: string; checked: string; offer: UpdateOffer }
  | { state: 'installing'; build: number; folder: string; offer: UpdateOffer }
  /** `message` nennt den Schritt und den Grund. */
  | { state: 'failed'; build: number; folder: string; message: string }

const isOffer = (o: unknown): o is UpdateOffer => {
  const v = o as UpdateOffer | null
  return !!v && typeof v.version === 'string' && typeof v.build === 'number' && typeof v.file === 'string'
}

/** Prüft eine Antwort des Hauptprozesses; alles Unerwartete zählt als „unavailable“. */
export function asUpdateState(value: unknown): UpdateState {
  const v = value as Record<string, unknown> | null
  const unavailable: UpdateState = { state: 'unavailable' }
  if (!v || typeof v !== 'object' || typeof v.state !== 'string') return unavailable
  if (v.state === 'unavailable') return unavailable
  if (typeof v.build !== 'number') return unavailable
  const build = v.build
  if (v.state === 'off') return { state: 'off', build }
  if (typeof v.folder !== 'string') return unavailable
  const folder = v.folder
  switch (v.state) {
    case 'current':
      return typeof v.checked === 'string' ? { state: 'current', build, folder, checked: v.checked } : unavailable
    case 'available':
      return typeof v.checked === 'string' && isOffer(v.offer) ? { state: 'available', build, folder, checked: v.checked, offer: v.offer } : unavailable
    case 'installing':
      return isOffer(v.offer) ? { state: 'installing', build, folder, offer: v.offer } : unavailable
    case 'failed':
      return typeof v.message === 'string' ? { state: 'failed', build, folder, message: v.message } : unavailable
  }
  return unavailable
}

export type ClaudeInfo = { path: string; version: string | null; error?: string }

export type AiResult = { ok: true; data: unknown } | { ok: false; error: string }

export interface MaidHost {
  /** Fragt Claude (über die lokale Claude CLI, ohne Werkzeuge) und liefert die strukturierte Antwort. */
  askAi(request: AiRequest): Promise<AiResult>
  openDialog(): Promise<string | null>
  saveDialog(suggestedName: string): Promise<string | null>
  read(path: string): Promise<OpenedFile>
  /**
   * Schreibt das Dokument. `sidecar === null` entfernt eine vorhandene
   * Begleitdatei, `undefined` lässt sie unangetastet.
   */
  write(path: string, content: string, sidecar: string | null | undefined): Promise<void>
  confirmDiscard(documentName: string): Promise<DiscardChoice>
  setDocumentState(state: DocumentState): void
  closeConfirmed(): void
  onMenu(handler: (command: MenuCommand) => void): () => void
  /** Datei, die per Finder, Dock oder „Zuletzt benutzt“ geöffnet werden soll. */
  onOpenPath(handler: (path: string) => void): () => void
  getSettings(): Promise<Settings>
  /** Speichert geänderte Werte und liefert die vollständigen Einstellungen. */
  setSettings(changes: Partial<Settings>): Promise<Settings>
  /** Welche Claude CLI würde benutzt, und in welcher Version? */
  claudeInfo(): Promise<ClaudeInfo>
  /**
   * Legt ein Bild im Bilderordner neben dem Dokument ab und liefert den Pfad
   * relativ zum Dokument (für den Markdown-Bildverweis).
   */
  saveImage(documentPath: string, data: Uint8Array, extension: string): Promise<string>
  /** Inhalt der Versionsdatei des Dokuments oder null, wenn es noch keine gibt. */
  readVersions(documentPath: string): Promise<string | null>
  writeVersions(documentPath: string, content: string): Promise<void>
  /** Öffnet einen Link (http, https, mailto) im Standardprogramm, z. B. dem Browser. */
  openExternal(url: string): void
  /** Aktualisierung aus einem Ordner: Zustand, Ordner wählen (Systemdialog) oder entfernen, prüfen, installieren. */
  updateState(): Promise<UpdateState>
  /** `true`: Ordner im Systemdialog wählen; `null`: Update-Ordner entfernen. */
  updateFolder(choose: true | null): Promise<UpdateState>
  checkForUpdate(): Promise<UpdateState>
  /** Entpackt, prüft die Signatur, beendet MAID und tauscht die App aus. */
  installUpdate(): Promise<UpdateState>
  onUpdate(handler: (state: UpdateState) => void): () => void
  /** Meldet dem Hauptprozess, dass die Oberfläche Befehle entgegennehmen kann. */
  ready(): void
}

export const SIDECAR_SUFFIX = '.maid.json'
/** Fassungen eines Dokuments liegen in `<datei>.md.commits.json` daneben. */
export const VERSIONS_SUFFIX = '.commits.json'
/** Früherer Name der Fassungen-Datei; wird beim nächsten Festhalten ersetzt. */
export const LEGACY_VERSIONS_SUFFIX = '.versions.json'

/** Bilder eines Dokuments liegen neben ihm in „<datei>.md - Images“ – im Finder direkt unter der Datei. */
export function imagesFolderName(documentFileName: string): string {
  return `${documentFileName} - Images`
}

/** Protokoll, über das die Druckfahne lokale Bilder lädt: maid-file://local/<absoluter Pfad>. */
export const LOCAL_FILE_SCHEME = 'maid-file'

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'heic', 'tif', 'tiff', 'bmp']

export const channels = {
  openDialog: 'file:open-dialog',
  saveDialog: 'file:save-dialog',
  read: 'file:read',
  write: 'file:write',
  confirmDiscard: 'dialog:confirm-discard',
  documentState: 'doc:state',
  closeConfirmed: 'window:close-confirmed',
  menu: 'menu:command',
  openPath: 'doc:open-path',
  ready: 'renderer:ready',
  askAi: 'ai:ask',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  claudeInfo: 'ai:claude-info',
  saveImage: 'file:save-image',
  readVersions: 'file:read-versions',
  writeVersions: 'file:write-versions',
  openExternal: 'shell:open-external',
  updateState: 'update-state',
  updateFolder: 'update-folder',
  updateCheck: 'update-check',
  updateInstall: 'update-install',
  update: 'update',
} as const
