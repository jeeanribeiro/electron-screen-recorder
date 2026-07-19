/**
 * The single source of truth for everything that crosses the process
 * boundary. Channel names, request payloads and response shapes live here;
 * the main process implements `IpcInvokeMap`, the preload script exposes a
 * matching `RendererApi` (see ./api.ts), and the renderer consumes it with
 * zero access to Node or Electron internals.
 */

export type SourceKind = 'screen' | 'window'

export interface CaptureSource {
  id: string
  name: string
  kind: SourceKind
  /** PNG data URL of the current source thumbnail. */
  thumbnail: string
  /** PNG data URL of the owning app's icon (windows only, may be null). */
  appIcon: string | null
}

export interface CaptureSelection {
  sourceId: string
  /** Request OS loopback audio (only honoured where the platform supports it). */
  systemAudio: boolean
  frameRate: number
}

export type RecordingFormat = 'webm' | 'mp4' | 'gif'

export interface RecordingMeta {
  /** Stable id — the file name inside the recordings directory. */
  id: string
  fileName: string
  filePath: string
  format: RecordingFormat
  sizeBytes: number
  durationMs: number
  createdAt: number
  sourceName: string
  /** PNG data URL, present once the ffmpeg thumbnail has been generated. */
  thumbnail: string | null
}

export interface SaveRecordingRequest {
  buffer: ArrayBuffer
  durationMs: number
  sourceName: string
}

export type ConvertTarget = Exclude<RecordingFormat, 'webm'>

export interface ConvertRequest {
  id: string
  target: ConvertTarget
}

export interface ConvertProgress {
  /** Job id: `${recordingId}=>${target}`. */
  jobId: string
  id: string
  target: ConvertTarget
  /** 0-100, or null when the source duration is unknown. */
  percent: number | null
  done: boolean
  error: string | null
  outputId: string | null
}

export interface ExportResult {
  canceled: boolean
  filePath: string | null
  error: string | null
}

export type RecorderPhase = 'idle' | 'recording' | 'paused' | 'saving'

export interface AppVersions {
  app: string
  electron: string
  chrome: string
  node: string
}

export interface AppCapabilities {
  /** True when the OS can capture system audio via loopback (Windows). */
  systemAudio: boolean
  /** `process.platform` of the main process ('win32', 'darwin', 'linux', ...). */
  platform: string
}

export interface AppSettings {
  /** Format recordings are kept in; mp4/gif auto-convert after capture. */
  format: RecordingFormat
  frameRate: 15 | 24 | 30 | 60
  /** null = default (<Videos>/Screen Recordings). */
  saveDirectory: string | null
  systemAudio: boolean
  microphone: boolean
}

/** Renderer -> main request/response channels (`ipcRenderer.invoke`). */
export interface IpcInvokeMap {
  'app:ping': () => 'pong'
  'app:versions': () => AppVersions
  'app:capabilities': () => AppCapabilities
  'capture:list-sources': () => CaptureSource[]
  'capture:select-source': (selection: CaptureSelection) => void
  'recording:save': (request: SaveRecordingRequest) => RecordingMeta
  'recording:state': (phase: RecorderPhase) => void
  'library:list': () => RecordingMeta[]
  'library:reveal': (id: string) => void
  'library:trash': (id: string) => void
  'library:export': (id: string) => ExportResult
  'library:convert': (request: ConvertRequest) => void
  'library:cancel-convert': (jobId: string) => void
  'settings:get': () => AppSettings
  'settings:update': (patch: Partial<AppSettings>) => AppSettings
  'settings:choose-directory': () => string | null
}

/** Main -> renderer push events (`webContents.send`). */
export interface IpcEventMap {
  'event:convert-progress': ConvertProgress
  'event:toggle-recording': undefined
  'event:library-changed': undefined
}

export type IpcChannel = keyof IpcInvokeMap
export type IpcEvent = keyof IpcEventMap

export const IPC_CHANNELS: readonly IpcChannel[] = [
  'app:ping',
  'app:versions',
  'app:capabilities',
  'capture:list-sources',
  'capture:select-source',
  'recording:save',
  'recording:state',
  'library:list',
  'library:reveal',
  'library:trash',
  'library:export',
  'library:convert',
  'library:cancel-convert',
  'settings:get',
  'settings:update',
  'settings:choose-directory',
]

export const IPC_EVENTS: readonly IpcEvent[] = [
  'event:convert-progress',
  'event:toggle-recording',
  'event:library-changed',
]
