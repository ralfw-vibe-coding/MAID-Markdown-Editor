import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type IpcMainEvent, type IpcMainInvokeEvent, type MenuItemConstructorOptions, type OpenDialogOptions } from 'electron'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { channels, isPlainTextPath, LEGACY_VERSIONS_SUFFIX, SIDECAR_SUFFIX, VERSIONS_SUFFIX, type AiRequest, type DiscardChoice, type DocumentState, type Settings, type MenuCommand, type OpenedFile } from '../shared/host'
import { askClaude, claudeInfo } from './ai'
import { getSettings, updateSettings } from './settings'
import { handleLocalFileScheme, registerLocalFileScheme, saveImage } from './images'
import { clearRecentDocuments, noteRecentDocument, recentDocuments } from './recent'

/** Zustand eines Dokumentfensters – jedes Fenster hat genau ein Dokument. */
type DocWindow = {
  win: BrowserWindow
  /** Oberfläche nimmt Befehle entgegen. */
  ready: boolean
  /** Dateien, die geöffnet werden sollen, sobald die Oberfläche bereit ist. */
  pending: string[]
  path: string | null
  dirty: boolean
  /** Neues, leeres, unverändertes Dokument – darf beim Öffnen einer Datei wiederverwendet werden. */
  pristine: boolean
  /** Rückfrage zu ungesicherten Änderungen ist erledigt; das Fenster darf schließen. */
  closeConfirmed: boolean
}

/** Fenster nach der ID ihres webContents (die auch IPC-Absender kennzeichnet). */
const windows = new Map<number, DocWindow>()
/** Dateien, die vor `ready` geöffnet werden sollen (Finder, Kommandozeile). */
const startupPaths: string[] = []
/** ⌘Q läuft: nach jeder Rückfrage weiter schließen; „Abbrechen“ beendet das Beenden. */
let quitting = false
/** Zuletzt aktives Fenster – Ziel von Menübefehlen, wenn gerade keins den Fokus hat (z. B. alle minimiert). */
let lastFocusedId: number | null = null

const docName = (dw: DocWindow) => (dw.path ? basename(dw.path) : 'Unbenannt')
const senderWindow = (e: IpcMainEvent | IpcMainInvokeEvent) => windows.get(e.sender.id)

function focusedDocWindow(): DocWindow | undefined {
  const w = BrowserWindow.getFocusedWindow()
  return (w && windows.get(w.webContents.id)) || (lastFocusedId !== null ? windows.get(lastFocusedId) : undefined)
}

/** Hat das aktive Fenster ein Textdokument? Dann gibt es kein Format-Menü. */
function focusedIsPlainText(): boolean {
  return isPlainTextPath(focusedDocWindow()?.path ?? null)
}

/** Menü neu aufbauen, wenn sich das aktive Dokument zwischen Markdown und Text ändert. */
let menuPlainText = false
function updateMenuForFocus() {
  if (focusedIsPlainText() !== menuPlainText) buildMenu()
}

/** Menübefehle gehen an das aktive Fenster. */
function send(command: MenuCommand) {
  focusedDocWindow()?.win.webContents.send(channels.menu, command)
}

function deliver(dw: DocWindow, path: string) {
  dw.pristine = false
  if (dw.ready) dw.win.webContents.send(channels.openPath, path)
  else dw.pending.push(path)
  dw.win.focus()
}

/**
 * Öffnet eine Datei: Ist sie schon offen, kommt ihr Fenster nach vorn. Sonst
 * wird ein leeres, unverändertes Fenster wiederverwendet oder ein neues geöffnet.
 */
function openPath(path: string) {
  if (!app.isReady()) return void startupPaths.push(path)
  const open = [...windows.values()].find((d) => d.path === path)
  if (open) return void open.win.focus()
  const candidate = focusedDocWindow() ?? [...windows.values()].at(-1)
  if (candidate?.pristine) deliver(candidate, path)
  else createWindow(path)
}

const MARKDOWN_FILTER = { name: 'Markdown', extensions: ['md', 'markdown'] }
const TEXT_FILTER = { name: 'Text', extensions: ['txt'] }

/** Links, die MAID an das Standardprogramm (Browser, Mail) weitergibt – nie Dateien oder Skripte. */
function openExternalLink(url: string): void {
  try {
    if (['http:', 'https:', 'mailto:'].includes(new URL(url).protocol)) void shell.openExternal(url)
  } catch {
    // Kein gültiger Link – nichts zu öffnen.
  }
}

function createWindow(path?: string): DocWindow {
  // Neue Fenster leicht versetzt zum aktiven, damit sie nicht genau übereinander liegen.
  const offset = BrowserWindow.getFocusedWindow()?.getPosition()
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    ...(offset ? { x: offset[0] + 26, y: offset[1] + 26 } : {}),
    minWidth: 800,
    minHeight: 500,
    title: 'MAID',
    backgroundColor: '#fbfaf7',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  // Das Fenster zeigt immer MAID: Links gehen in den Browser, statt die Oberfläche zu ersetzen.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalLink(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url.split('#')[0] === win.webContents.getURL().split('#')[0]) return
    e.preventDefault()
    openExternalLink(url)
  })
  const id = win.webContents.id
  const dw: DocWindow = { win, ready: false, pending: path ? [path] : [], path: null, dirty: false, pristine: !path, closeConfirmed: false }
  windows.set(id, dw)
  lastFocusedId = id
  win.on('focus', () => {
    lastFocusedId = id
    updateMenuForFocus()
  })

  win.on('close', async (e) => {
    if (!dw.dirty || dw.closeConfirmed) return
    e.preventDefault()
    // Mit Auto-Speichern wird ohne Rückfrage gespeichert (nur Dokumente mit Dateinamen).
    if (getSettings().autoSave && dw.path) return void win.webContents.send(channels.menu, 'saveAndClose' satisfies MenuCommand)
    const choice = await askDiscard(win, docName(dw))
    if (choice === 'save') win.webContents.send(channels.menu, 'saveAndClose' satisfies MenuCommand)
    else if (choice === 'discard') {
      dw.closeConfirmed = true
      win.close()
    } else quitting = false
  })
  win.on('closed', () => {
    windows.delete(id)
    if (lastFocusedId === id) lastFocusedId = [...windows.keys()].at(-1) ?? null
    // Beim Beenden nach einer Rückfrage mit den übrigen Fenstern weitermachen.
    if (quitting && windows.size > 0) app.quit()
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) win.loadURL(devUrl)
  else win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  return dw
}

async function showOpenDialog() {
  const parent = BrowserWindow.getFocusedWindow()
  const options: OpenDialogOptions = {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Markdown und Text', extensions: ['md', 'markdown', 'txt'] }],
  }
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  if (!result.canceled) for (const path of result.filePaths) openPath(path)
}

/** Merkt sich ein geöffnetes oder gespeichertes Dokument für „Zuletzt benutzt“. */
function rememberRecent(path: string) {
  // Auch in die Liste von macOS (Dock-Menü); das Menü baut MAID aus der eigenen.
  app.addRecentDocument(path)
  if (noteRecentDocument(path)) buildMenu()
}

/** Untermenü „Zuletzt benutzt“; gleichnamige Dateien bekommen ihren Ordner dazu. */
function recentMenu(): MenuItemConstructorOptions[] {
  const paths = recentDocuments()
  const names = paths.map((p) => basename(p))
  const items: MenuItemConstructorOptions[] = paths.map((path, i) => ({
    label: names.indexOf(names[i]) === names.lastIndexOf(names[i]) ? names[i] : `${names[i]} – ${basename(dirname(path))}`,
    toolTip: path,
    click: () => openPath(path),
  }))
  if (items.length > 0) items.push({ type: 'separator' })
  items.push({
    label: 'Liste löschen',
    enabled: paths.length > 0,
    click: () => {
      clearRecentDocuments()
      app.clearRecentDocuments()
      buildMenu()
    },
  })
  return items
}

async function askDiscard(parent: BrowserWindow, name: string): Promise<DiscardChoice> {
  const { response } = await dialog.showMessageBox(parent, {
    type: 'warning',
    message: `Änderungen an „${name}“ speichern?`,
    detail: 'Ohne Speichern gehen die Änderungen und neue Kommentare verloren.',
    buttons: ['Speichern', 'Nicht speichern', 'Abbrechen'],
    defaultId: 0,
    cancelId: 2,
  })
  return (['save', 'discard', 'cancel'] as const)[response]
}

/** Schreibt erst in eine temporäre Datei und benennt dann um, damit nie eine halbe Datei entsteht. */
async function writeAtomic(path: string, content: string) {
  const tmp = `${path}.maid-tmp`
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, path)
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

function registerIpc() {
  ipcMain.handle(channels.openDialog, async (e) => {
    const result = await dialog.showOpenDialog(senderWindow(e)!.win, {
      properties: ['openFile'],
      filters: [{ name: 'Markdown und Text', extensions: ['md', 'markdown', 'txt'] }],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(channels.saveDialog, async (e, suggestedName: string) => {
    const result = await dialog.showSaveDialog(senderWindow(e)!.win, {
      defaultPath: suggestedName,
      // Das Format des Dokuments zuerst: eine .txt bleibt beim „Sichern unter …“ Text.
      filters: /\.txt$/i.test(suggestedName) ? [TEXT_FILTER, MARKDOWN_FILTER] : [MARKDOWN_FILTER, TEXT_FILTER],
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle(channels.read, async (_e, path: string): Promise<OpenedFile> => {
    const content = await readFile(path, 'utf8')
    const sidecar = await readOptional(path + SIDECAR_SUFFIX)
    rememberRecent(path)
    return { path, content, sidecar }
  })

  ipcMain.handle(channels.write, async (_e, path: string, content: string, sidecar: string | null | undefined) => {
    await writeAtomic(path, content)
    const sidecarPath = path + SIDECAR_SUFFIX
    if (typeof sidecar === 'string') await writeAtomic(sidecarPath, sidecar)
    else if (sidecar === null) {
      await unlink(sidecarPath).catch((err) => {
        if (err.code !== 'ENOENT') throw err
      })
    }
    rememberRecent(path)
  })

  ipcMain.handle(channels.confirmDiscard, (e, name: string) => askDiscard(senderWindow(e)!.win, name))

  ipcMain.handle(channels.askAi, (_e, request: AiRequest) => askClaude(request))
  ipcMain.handle(channels.getSettings, () => getSettings())
  ipcMain.handle(channels.setSettings, async (_e, changes: Partial<Settings>) => {
    const before = getSettings().writingLine > 0
    const settings = await updateSettings(changes)
    // Häkchen bei „Schreibzeile hier festhalten“ nachziehen.
    if (settings.writingLine > 0 !== before) buildMenu()
    return settings
  })
  ipcMain.handle(channels.claudeInfo, () => claudeInfo())
  // Fassungen unter altem Namen (.versions.json) werden gelesen und beim nächsten Schreiben ersetzt.
  ipcMain.handle(
    channels.readVersions,
    async (_e, documentPath: string) => (await readOptional(documentPath + VERSIONS_SUFFIX)) ?? readOptional(documentPath + LEGACY_VERSIONS_SUFFIX),
  )
  ipcMain.handle(channels.writeVersions, async (_e, documentPath: string, content: string) => {
    await writeAtomic(documentPath + VERSIONS_SUFFIX, content)
    await unlink(documentPath + LEGACY_VERSIONS_SUFFIX).catch(() => {})
  })
  ipcMain.handle(channels.saveImage, (_e, documentPath: string, data: Uint8Array, extension: string) => saveImage(documentPath, data, extension))

  ipcMain.on(channels.openExternal, (_e, url: string) => openExternalLink(url))

  ipcMain.on(channels.documentState, (e, state: DocumentState) => {
    const dw = senderWindow(e)
    if (!dw) return
    dw.path = state.path
    dw.dirty = state.dirty
    dw.pristine = !state.path && !state.dirty && state.empty && dw.pending.length === 0
    dw.win.setTitle(docName(dw))
    dw.win.setRepresentedFilename(state.path ?? '')
    dw.win.setDocumentEdited(state.dirty)
    updateMenuForFocus()
  })

  ipcMain.on(channels.closeConfirmed, (e) => {
    const dw = senderWindow(e)
    if (!dw) return
    dw.closeConfirmed = true
    dw.win.close()
  })

  ipcMain.on(channels.ready, (e) => {
    const dw = senderWindow(e)
    if (!dw) return
    dw.ready = true
    for (const path of dw.pending.splice(0)) dw.win.webContents.send(channels.openPath, path)
  })
}

function buildMenu() {
  menuPlainText = focusedIsPlainText()
  // Formatieren erzeugt Markdown – bei reinem Text gibt es das Menü nicht.
  const format: MenuItemConstructorOptions = {
    label: 'Format',
    submenu: [
      { label: 'Fett', accelerator: 'CmdOrCtrl+B', click: () => send('format:bold') },
      { label: 'Kursiv', accelerator: 'CmdOrCtrl+I', click: () => send('format:italic') },
      { label: 'Unterstrichen', accelerator: 'CmdOrCtrl+U', click: () => send('format:underline') },
      { label: 'Durchgestrichen', accelerator: 'Shift+CmdOrCtrl+X', click: () => send('format:strike') },
      { label: 'Hervorgehoben', accelerator: 'Shift+CmdOrCtrl+H', click: () => send('format:highlight') },
      { type: 'separator' },
      { label: 'Link einfügen', accelerator: 'CmdOrCtrl+K', click: () => send('format:link') },
    ],
  }
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: `Über ${app.name}` },
        { type: 'separator' },
        { label: 'Einstellungen …', accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
        { type: 'separator' },
        { role: 'services', label: 'Dienste' },
        { type: 'separator' },
        { role: 'hide', label: `${app.name} ausblenden` },
        { role: 'hideOthers', label: 'Andere ausblenden' },
        { role: 'unhide', label: 'Alle einblenden' },
        { type: 'separator' },
        { role: 'quit', label: `${app.name} beenden` },
      ],
    },
    {
      label: 'Ablage',
      submenu: [
        { label: 'Neu', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
        { label: 'Öffnen …', accelerator: 'CmdOrCtrl+O', click: () => void showOpenDialog() },
        { label: 'Zuletzt benutzt', submenu: recentMenu() },
        { type: 'separator' },
        { label: 'Speichern', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Speichern unter …', accelerator: 'Shift+CmdOrCtrl+S', click: () => send('saveAs') },
        { label: 'Fassung festhalten …', accelerator: 'Alt+CmdOrCtrl+S', click: () => send('saveVersion') },
        { type: 'separator' },
        { role: 'close', label: 'Fenster schließen' },
      ],
    },
    // Standardmenüs mit deutschen Bezeichnungen (Electron liefert sie sonst englisch).
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo', label: 'Widerrufen' },
        { role: 'redo', label: 'Wiederholen' },
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einsetzen' },
        { role: 'pasteAndMatchStyle', label: 'Einsetzen und Stil anpassen' },
        { role: 'delete', label: 'Löschen' },
        { role: 'selectAll', label: 'Alles auswählen' },
        { type: 'separator' },
        {
          label: 'Suchen',
          submenu: [
            { label: 'Suchen …', accelerator: 'CmdOrCtrl+F', click: () => send('find:open') },
            { label: 'Suchen und Ersetzen …', accelerator: 'Alt+CmdOrCtrl+F', click: () => send('find:replace') },
            { label: 'Weitersuchen', accelerator: 'CmdOrCtrl+G', click: () => send('find:next') },
            { label: 'Rückwärts suchen', accelerator: 'Shift+CmdOrCtrl+G', click: () => send('find:previous') },
          ],
        },
      ],
    },
    ...(menuPlainText ? [] : [format]),
    {
      label: 'KI',
      submenu: [
        // Kommentar: an eine Stelle gebunden (Markierung oder Cursor). Chat: zum ganzen Dokument.
        { label: menuPlainText ? 'Kommentar zur Stelle' : 'Kommentar zur Druckfahne', accelerator: 'Shift+CmdOrCtrl+K', click: () => send('askAi') },
        { label: 'Chat mit Manuskript', accelerator: 'Shift+CmdOrCtrl+L', click: () => send('chat') },
      ],
    },
    {
      label: 'Darstellung',
      submenu: [
        {
          label: 'Schreibzeile hier festhalten',
          type: 'checkbox',
          checked: getSettings().writingLine > 0,
          accelerator: 'Alt+CmdOrCtrl+T',
          click: () => send('writingLine'),
        },
        { type: 'separator' },
        { role: 'reload', label: 'Neu laden' },
        { role: 'toggleDevTools', label: 'Entwicklerwerkzeuge' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Originalgröße' },
        { role: 'zoomIn', label: 'Vergrößern' },
        { role: 'zoomOut', label: 'Verkleinern' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Vollbildmodus' },
      ],
    },
    {
      label: 'Fenster',
      role: 'window',
      submenu: [
        { role: 'minimize', label: 'Im Dock ablegen' },
        { role: 'zoom', label: 'Zoomen' },
        { type: 'separator' },
        { role: 'front', label: 'Alle nach vorne bringen' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

registerLocalFileScheme()

// Name für Menü „Über …“/„… beenden“; Dock und ⌘-Tab nehmen ihn aus dem Bundle (scripts/brand-electron.mjs).
app.setName('MAID')

// Kann vor `ready` kommen, z. B. beim Start per Doppelklick auf eine .md-Datei.
app.on('open-file', (e, path) => {
  e.preventDefault()
  openPath(path)
})

app.whenReady().then(() => {
  // Die Entwicklungs-MAID.app hat nur ein .icns, das macOS 26 in eine graue Kachel setzt;
  // icon-dock.png ist das Icon so, wie es die installierte App (Icon-Composer-Format) zeigt.
  if (!app.isPackaged) app.dock?.setIcon(join(import.meta.dirname, '../../resources/icon-dock.png'))
  // Dateien von der Kommandozeile, z. B. `npm run app -- -- text.md`
  for (const arg of process.argv.slice(app.isPackaged ? 1 : 2)) {
    if (/\.(md|markdown|txt)$/i.test(arg)) startupPaths.push(arg)
  }
  handleLocalFileScheme()
  registerIpc()
  buildMenu()
  // Je Datei ein Fenster; ohne Datei ein leeres.
  const paths = [...new Set(startupPaths.splice(0))]
  if (paths.length === 0) createWindow()
  for (const path of paths) createWindow(path)
  app.on('activate', () => {
    if (windows.size === 0) createWindow()
  })
})

app.on('before-quit', () => {
  quitting = true
})
app.on('window-all-closed', () => app.quit())
