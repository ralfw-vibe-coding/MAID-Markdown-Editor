import { app, BrowserWindow, dialog, ipcMain, Menu, type IpcMainEvent, type IpcMainInvokeEvent, type MenuItemConstructorOptions, type OpenDialogOptions } from 'electron'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { channels, SIDECAR_SUFFIX, type AiRequest, type DiscardChoice, type DocumentState, type Settings, type MenuCommand, type OpenedFile } from '../shared/host'
import { askClaude, claudeInfo } from './ai'
import { getSettings, updateSettings } from './settings'
import { handleLocalFileScheme, registerLocalFileScheme, saveImage } from './images'

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
  const id = win.webContents.id
  const dw: DocWindow = { win, ready: false, pending: path ? [path] : [], path: null, dirty: false, pristine: !path, closeConfirmed: false }
  windows.set(id, dw)
  lastFocusedId = id
  win.on('focus', () => {
    lastFocusedId = id
  })

  win.on('close', async (e) => {
    if (!dw.dirty || dw.closeConfirmed) return
    e.preventDefault()
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
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
  }
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  if (!result.canceled) for (const path of result.filePaths) openPath(path)
}

async function askDiscard(parent: BrowserWindow, name: string): Promise<DiscardChoice> {
  const { response } = await dialog.showMessageBox(parent, {
    type: 'warning',
    message: `Änderungen an „${name}“ sichern?`,
    detail: 'Ohne Sichern gehen die Änderungen und neue Kommentare verloren.',
    buttons: ['Sichern', 'Nicht sichern', 'Abbrechen'],
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
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(channels.saveDialog, async (e, suggestedName: string) => {
    const result = await dialog.showSaveDialog(senderWindow(e)!.win, {
      defaultPath: suggestedName,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle(channels.read, async (_e, path: string): Promise<OpenedFile> => {
    const content = await readFile(path, 'utf8')
    const sidecar = await readOptional(path + SIDECAR_SUFFIX)
    app.addRecentDocument(path)
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
    app.addRecentDocument(path)
  })

  ipcMain.handle(channels.confirmDiscard, (e, name: string) => askDiscard(senderWindow(e)!.win, name))

  ipcMain.handle(channels.askAi, (_e, request: AiRequest) => askClaude(request))
  ipcMain.handle(channels.getSettings, () => getSettings())
  ipcMain.handle(channels.setSettings, (_e, changes: Partial<Settings>) => updateSettings(changes))
  ipcMain.handle(channels.claudeInfo, () => claudeInfo())
  ipcMain.handle(channels.saveImage, (_e, documentPath: string, data: Uint8Array, extension: string) => saveImage(documentPath, data, extension))

  ipcMain.on(channels.documentState, (e, state: DocumentState) => {
    const dw = senderWindow(e)
    if (!dw) return
    dw.path = state.path
    dw.dirty = state.dirty
    dw.pristine = !state.path && !state.dirty && state.empty && dw.pending.length === 0
    dw.win.setTitle(docName(dw))
    dw.win.setRepresentedFilename(state.path ?? '')
    dw.win.setDocumentEdited(state.dirty)
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
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Einstellungen …', accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Ablage',
      submenu: [
        { label: 'Neu', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
        { label: 'Öffnen …', accelerator: 'CmdOrCtrl+O', click: () => void showOpenDialog() },
        { role: 'recentDocuments', submenu: [{ role: 'clearRecentDocuments' }] },
        { type: 'separator' },
        { label: 'Sichern', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Sichern unter …', accelerator: 'Shift+CmdOrCtrl+S', click: () => send('saveAs') },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'KI',
      submenu: [
        // Kommentar: an eine Stelle gebunden (Markierung oder Cursor). Chat: zum ganzen Dokument.
        { label: 'Kommentar zur Druckfahne', accelerator: 'Shift+CmdOrCtrl+K', click: () => send('askAi') },
        { label: 'Chat zum Manuskript', accelerator: 'Shift+CmdOrCtrl+L', click: () => send('chat') },
      ],
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
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
  // Das Bundle-Icon steckt in MAID.app; das Dock cached Icons aber hartnäckig.
  if (!app.isPackaged) app.dock?.setIcon(join(import.meta.dirname, '../../resources/icon.png'))
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
