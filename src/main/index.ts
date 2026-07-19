import { app, desktopCapturer, globalShortcut, session } from 'electron'
import { autoUpdater } from 'electron-updater'
import { takePendingSelection } from './capture'
import { registerIpcHandlers } from './ipc'
import { createTray, requestToggleRecording } from './tray'
import { createMainWindow } from './window'

const SHORTCUT = 'CommandOrControl+Shift+R'

// Isolated data dir for e2e tests and screenshot capture sessions.
if (process.env.SCREEN_RECORDER_USER_DATA) {
  app.setPath('userData', process.env.SCREEN_RECORDER_USER_DATA)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => void createMainWindow())

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.jeanribeiro.screen-recorder')
    hardenSession()
    setupDisplayMediaHandler()
    registerIpcHandlers()
    await createMainWindow()
    createTray()
    registerShortcut()
    setupAutoUpdater()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => void createMainWindow())

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

/**
 * The renderer only ever needs two permissions: `media` (microphone) and
 * `display-capture` (screen recording). Everything else is denied.
 */
function hardenSession(): void {
  const allowed = new Set(['media', 'display-capture'])
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allowed.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))
}

/**
 * getDisplayMedia() in the renderer resolves through this handler. The
 * renderer never touches source ids directly — it registers a selection
 * over IPC (one-shot) and the main process attaches the matching source.
 * System audio uses OS loopback where supported (Windows).
 */
function setupDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void (async () => {
      const selection = takePendingSelection()
      if (!selection) {
        callback({})
        return
      }
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
      const source =
        sources.find((candidate) => candidate.id === selection.sourceId) ??
        sources.find((candidate) => candidate.id.startsWith('screen'))
      if (!source) {
        callback({})
        return
      }
      if (selection.systemAudio && process.platform === 'win32') {
        callback({ video: source, audio: 'loopback' })
      } else {
        callback({ video: source })
      }
    })()
  })
}

function registerShortcut(): void {
  const registered = globalShortcut.register(SHORTCUT, () => void requestToggleRecording())
  if (!registered) {
    console.warn(`Global shortcut ${SHORTCUT} is already taken by another application`)
  }
}

/** GitHub Releases-backed auto-update; see RELEASING.md for signing caveats. */
function setupAutoUpdater(): void {
  if (!app.isPackaged) return
  autoUpdater.checkForUpdatesAndNotify().catch((error: unknown) => {
    console.warn('Auto-update check failed:', error)
  })
}
