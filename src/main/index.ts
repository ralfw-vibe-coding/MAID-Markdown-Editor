import { app, BrowserWindow, dialog, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { channels, SIDECAR_SUFFIX, type AiRequest, type DiscardChoice, type Settings, type MenuCommand, type OpenedFile } from '../shared/host'
import { askClaude, claudeInfo } from './ai'
import { getSettings, updateSettings } from './settings'

let win: BrowserWindow | null = null
let rendererReady = false
let dirty = false
let closeConfirmed = false
let documentName = 'Unbenannt'
/** Dateien, die geöffnet werden sollen, bevor die Oberfläche bereit ist. */
const pendingPaths: string[] = []

function send(command: MenuCommand) {
  win?.webContents.send(channels.menu, command)
}

function openPath(path: string) {
  if (win && rendererReady) {
    win.webContents.send(channels.openPath, path)
    win.focus()
  } else {
    pendingPaths.push(path)
    if (!win && app.isReady()) createWindow()
  }
}

function createWindow() {
  rendererReady = false
  closeConfirmed = false
  win = new BrowserWindow({
    width: 1440,
    height: 900,
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

  win.on('close', async (e) => {
    if (!dirty || closeConfirmed || !win) return
    e.preventDefault()
    const choice = await askDiscard(win)
    if (choice === 'save') send('saveAndClose')
    else if (choice === 'discard') {
      closeConfirmed = true
      win.close()
    }
  })
  win.on('closed', () => {
    win = null
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) win.loadURL(devUrl)
  else win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

async function askDiscard(parent: BrowserWindow, name = documentName): Promise<DiscardChoice> {
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
  ipcMain.handle(channels.openDialog, async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(channels.saveDialog, async (_e, suggestedName: string) => {
    const result = await dialog.showSaveDialog(win!, {
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

  ipcMain.handle(channels.confirmDiscard, (_e, name: string) => askDiscard(win!, name))

  ipcMain.handle(channels.askAi, (_e, request: AiRequest) => askClaude(request))
  ipcMain.handle(channels.getSettings, () => getSettings())
  ipcMain.handle(channels.setSettings, (_e, changes: Partial<Settings>) => updateSettings(changes))
  ipcMain.handle(channels.claudeInfo, () => claudeInfo())

  ipcMain.on(channels.documentState, (_e, state: { path: string | null; dirty: boolean }) => {
    dirty = state.dirty
    documentName = state.path ? basename(state.path) : 'Unbenannt'
    if (!win) return
    win.setTitle(documentName)
    win.setRepresentedFilename(state.path ?? '')
    win.setDocumentEdited(state.dirty)
  })

  ipcMain.on(channels.closeConfirmed, () => {
    closeConfirmed = true
    win?.close()
  })

  ipcMain.on(channels.ready, () => {
    rendererReady = true
    for (const path of pendingPaths.splice(0)) win?.webContents.send(channels.openPath, path)
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
        { label: 'Neu', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: 'Öffnen …', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
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
      label: 'Kommentar',
      submenu: [{ label: 'Mit KI besprechen', accelerator: 'Shift+CmdOrCtrl+K', click: () => send('askAi') }],
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

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
  // Dateien von der Kommandozeile, z. B. `npm run app -- text.md`
  for (const arg of process.argv.slice(app.isPackaged ? 1 : 2)) {
    if (/\.(md|markdown|txt)$/i.test(arg)) pendingPaths.push(arg)
  }
  registerIpc()
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (!win) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())
