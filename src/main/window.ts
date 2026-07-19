import { join } from 'node:path'
import { BrowserWindow, app, shell } from 'electron'
import type { IpcEvent, IpcEventMap } from '@shared/ipc'

export const APP_TITLE = 'Screen Recorder'

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

/** Typed main -> renderer push. No-op when the window is closed. */
export function sendToRenderer<E extends IpcEvent>(
  channel: E,
  ...payload: IpcEventMap[E] extends undefined ? [] : [IpcEventMap[E]]
): void {
  getMainWindow()?.webContents.send(channel, ...payload)
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const existing = getMainWindow()
  if (existing) {
    existing.show()
    existing.focus()
    return existing
  }

  const win = new BrowserWindow({
    title: APP_TITLE,
    width: 1080,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0f14',
    ...(process.platform !== 'darwin'
      ? { icon: join(app.getAppPath(), 'resources', 'icons', 'icon-256.png') }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The renderer is a pure web page: no Node, no Electron internals.
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  })
  mainWindow = win

  win.on('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // The app never hosts external content; deny every window open and
  // navigation attempt, punting https links to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
