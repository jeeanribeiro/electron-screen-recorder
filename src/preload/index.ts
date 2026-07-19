import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC_EVENTS } from '@shared/ipc'
import type { IpcEvent, IpcEventMap, IpcInvokeMap } from '@shared/ipc'
import type { RendererApi } from '@shared/api'

/**
 * Sandboxed preload: the only bridge between the renderer and the rest of
 * the app. Every call is typed against the shared IPC contract; the
 * renderer receives plain async functions and event subscriptions — never
 * ipcRenderer itself.
 */

function invoke<C extends keyof IpcInvokeMap>(
  channel: C,
  ...args: Parameters<IpcInvokeMap[C]>
): Promise<Awaited<ReturnType<IpcInvokeMap[C]>>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<Awaited<ReturnType<IpcInvokeMap[C]>>>
}

function on<E extends IpcEvent>(
  channel: E,
  listener: (payload: IpcEventMap[E]) => void
): () => void {
  if (!IPC_EVENTS.includes(channel)) {
    throw new Error(`Unknown event channel: ${channel}`)
  }
  const wrapped = (_event: IpcRendererEvent, payload: IpcEventMap[E]): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

const api: RendererApi = {
  ping: () => invoke('app:ping'),
  versions: () => invoke('app:versions'),
  capabilities: () => invoke('app:capabilities'),

  listSources: () => invoke('capture:list-sources'),
  selectSource: (selection) => invoke('capture:select-source', selection),

  saveRecording: (request) => invoke('recording:save', request),
  setRecorderState: (phase) => invoke('recording:state', phase),

  listRecordings: () => invoke('library:list'),
  revealRecording: (id) => invoke('library:reveal', id),
  trashRecording: (id) => invoke('library:trash', id),
  exportRecording: (id) => invoke('library:export', id),
  convertRecording: (request) => invoke('library:convert', request),
  cancelConvert: (jobId) => invoke('library:cancel-convert', jobId),

  getSettings: () => invoke('settings:get'),
  updateSettings: (patch) => invoke('settings:update', patch),
  chooseSaveDirectory: () => invoke('settings:choose-directory'),

  onConvertProgress: (listener) => on('event:convert-progress', listener),
  onToggleRecording: (listener) => on('event:toggle-recording', () => listener()),
  onLibraryChanged: (listener) => on('event:library-changed', () => listener()),
}

contextBridge.exposeInMainWorld('api', api)
