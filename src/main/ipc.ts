import { app, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { IpcInvokeMap } from '@shared/ipc'
import { listSources, setPendingSelection } from './capture'
import { cancelConvertJob } from './ffmpeg'
import {
  convertRecording,
  exportRecording,
  listRecordings,
  revealRecording,
  saveRecording,
  trashRecording,
} from './library'
import { chooseSaveDirectory, getSettings, updateSettings } from './settings'
import { setTrayRecorderPhase } from './tray'
import { getMainWindow } from './window'

/**
 * `ipcMain.handle` with the channel/payload/response types pinned to the
 * shared contract. A handler that drifts from `IpcInvokeMap` fails to
 * compile — the same guarantee the preload bridge gives the other side.
 */
function handle<C extends keyof IpcInvokeMap>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: Parameters<IpcInvokeMap[C]>
  ) => ReturnType<IpcInvokeMap[C]> | Promise<Awaited<ReturnType<IpcInvokeMap[C]>>>
): void {
  ipcMain.handle(channel, handler as (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown)
}

export function registerIpcHandlers(): void {
  handle('app:ping', () => 'pong')
  handle('app:versions', () => ({
    app: app.getVersion(),
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node,
  }))
  handle('app:capabilities', () => ({
    systemAudio: process.platform === 'win32',
    platform: process.platform,
  }))

  handle('capture:list-sources', () => listSources())
  handle('capture:select-source', (_event, selection) => {
    setPendingSelection(selection)
  })

  handle('recording:save', (_event, request) => saveRecording(request))
  handle('recording:state', (_event, phase) => {
    setTrayRecorderPhase(phase)
  })

  handle('library:list', () => listRecordings())
  handle('library:reveal', (_event, id) => revealRecording(id))
  handle('library:trash', (_event, id) => trashRecording(id))
  handle('library:export', (_event, id) => exportRecording(id))
  handle('library:convert', (_event, request) => convertRecording(request))
  handle('library:cancel-convert', (_event, jobId) => {
    cancelConvertJob(jobId)
  })

  handle('settings:get', () => getSettings())
  handle('settings:update', (_event, patch) => updateSettings(patch))
  handle('settings:choose-directory', () => chooseSaveDirectory(getMainWindow()))
}
