import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { channels, type MaidHost, type MenuCommand } from '../shared/host'

function subscribe<T>(channel: string, handler: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, value: T) => handler(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const host: MaidHost = {
  askAi: (request) => ipcRenderer.invoke(channels.askAi, request),
  getSettings: () => ipcRenderer.invoke(channels.getSettings),
  setSettings: (changes) => ipcRenderer.invoke(channels.setSettings, changes),
  claudeInfo: () => ipcRenderer.invoke(channels.claudeInfo),
  saveImage: (documentPath, data, extension) => ipcRenderer.invoke(channels.saveImage, documentPath, data, extension),
  readVersions: (documentPath) => ipcRenderer.invoke(channels.readVersions, documentPath),
  writeVersions: (documentPath, content) => ipcRenderer.invoke(channels.writeVersions, documentPath, content),
  openExternal: (url) => ipcRenderer.send(channels.openExternal, url),
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
