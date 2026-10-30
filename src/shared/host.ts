/** Schnittstelle zwischen Oberfläche (Renderer) und Hauptprozess, bereitgestellt vom Preload-Skript als `window.maid`. */

export type OpenedFile = {
  path: string
  content: string
  /** Inhalt der Begleitdatei `<datei>.maid.json`, falls vorhanden. */
  sidecar: string | null
}

export type MenuCommand = 'new' | 'open' | 'save' | 'saveAs' | 'saveAndClose'

export type DiscardChoice = 'save' | 'discard' | 'cancel'

export interface MaidHost {
  openDialog(): Promise<string | null>
  saveDialog(suggestedName: string): Promise<string | null>
  read(path: string): Promise<OpenedFile>
  /**
   * Schreibt das Dokument. `sidecar === null` entfernt eine vorhandene
   * Begleitdatei, `undefined` lässt sie unangetastet.
   */
  write(path: string, content: string, sidecar: string | null | undefined): Promise<void>
  confirmDiscard(documentName: string): Promise<DiscardChoice>
  setDocumentState(state: { path: string | null; dirty: boolean }): void
  closeConfirmed(): void
  onMenu(handler: (command: MenuCommand) => void): () => void
  /** Datei, die per Finder, Dock oder „Zuletzt benutzt“ geöffnet werden soll. */
  onOpenPath(handler: (path: string) => void): () => void
  /** Meldet dem Hauptprozess, dass die Oberfläche Befehle entgegennehmen kann. */
  ready(): void
}

export const SIDECAR_SUFFIX = '.maid.json'

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
} as const
