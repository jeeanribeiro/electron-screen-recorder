import { join } from 'node:path'
import { Menu, Tray, app, nativeImage, shell } from 'electron'
import type { RecorderPhase } from '@shared/ipc'
import { recordingsDir } from './library'
import { APP_TITLE, createMainWindow, getMainWindow, sendToRenderer } from './window'

let tray: Tray | null = null
let phase: RecorderPhase = 'idle'

function trayIcon(name: string): Electron.NativeImage {
  return nativeImage.createFromPath(join(app.getAppPath(), 'resources', 'icons', `${name}.png`))
}

async function showWindow(): Promise<void> {
  const win = getMainWindow()
  if (win) {
    win.show()
    win.focus()
  } else {
    await createMainWindow()
  }
}

/** Tray menu item / global shortcut: start or stop the current recording. */
export async function requestToggleRecording(): Promise<void> {
  if (phase === 'idle') await showWindow()
  sendToRenderer('event:toggle-recording')
}

export function createTray(): void {
  if (tray) return
  tray = new Tray(trayIcon('tray-idle'))
  tray.setToolTip(APP_TITLE)
  tray.on('click', () => void showWindow())
  rebuildMenu()
}

export function setTrayRecorderPhase(next: RecorderPhase): void {
  if (phase === next) return
  phase = next
  if (!tray) return
  const active = phase === 'recording' || phase === 'paused'
  tray.setImage(trayIcon(active ? 'tray-recording' : 'tray-idle'))
  tray.setToolTip(active ? `${APP_TITLE} — recording` : APP_TITLE)
  rebuildMenu()
}

function rebuildMenu(): void {
  if (!tray) return
  const active = phase === 'recording' || phase === 'paused'
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: active ? 'Stop recording' : 'Start recording',
        click: () => void requestToggleRecording(),
      },
      { label: `Open ${APP_TITLE}`, click: () => void showWindow() },
      { label: 'Open recordings folder', click: () => void shell.openPath(recordingsDir()) },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' },
    ])
  )
}
