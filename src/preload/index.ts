import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { channels, type MaidHost, type MenuCommand } from '../shared/host'

function subscribe<T>(channel: string, handler: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, value: T) => handler(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const host: MaidHost = {
  askAi: (request) => ipcRenderer.invoke(channels.askAi, request),
  openDialog: () => ipcRenderer.invoke(channels.openDialog),
  saveDialog: (suggestedName) => ipcRenderer.invoke(channels.saveDialog, suggestedName),
  read: (path) => ipcRenderer.invoke(channels.read, path),
  write: (path, content, sidecar) => ipcRenderer.invoke(channels.write, path, content, sidecar),
  confirmDiscard: (name) => ipcRenderer.invoke(channels.confirmDiscard, name),
  setDocumentState: (state) => ipcRenderer.send(channels.documentState, state),
  closeConfirmed: () => ipcRenderer.send(channels.closeConfirmed),
  onMenu: (handler) => subscribe<MenuCommand>(channels.menu, handler),
  onOpenPath: (handler) => subscribe<string>(channels.openPath, handler),
  ready: () => ipcRenderer.send(channels.ready),
}

contextBridge.exposeInMainWorld('maid', host)
