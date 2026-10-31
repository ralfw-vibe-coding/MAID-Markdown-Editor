/** Schnittstelle zwischen Oberfläche (Renderer) und Hauptprozess, bereitgestellt vom Preload-Skript als `window.maid`. */

export type OpenedFile = {
  path: string
  content: string
  /** Inhalt der Begleitdatei `<datei>.maid.json`, falls vorhanden. */
  sidecar: string | null
}

/** Formatierungen im Manuskript (Menü „Format“, Tastenkürzel, Symbolleiste). */
export type FormatCommand = 'bold' | 'italic' | 'underline' | 'strike' | 'highlight' | 'link'

export type MenuCommand = 'new' | 'open' | 'save' | 'saveAs' | 'saveAndClose' | 'askAi' | 'chat' | 'settings' | 'saveVersion' | `format:${FormatCommand}`

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
  /** Meldet dem Hauptprozess, dass die Oberfläche Befehle entgegennehmen kann. */
  ready(): void
}

export const SIDECAR_SUFFIX = '.maid.json'
/** Versionen eines Dokuments liegen in `<datei>.versions.json` daneben. */
export const VERSIONS_SUFFIX = '.versions.json'

/** Bilder eines Dokuments liegen neben ihm in „<Name ohne Endung> - Images“. */
export function imagesFolderName(documentFileName: string): string {
  return `${documentFileName.replace(/\.(md|markdown|txt)$/i, '')} - Images`
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
} as const
