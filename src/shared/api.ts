import type {
  AppCapabilities,
  AppSettings,
  AppVersions,
  CaptureSelection,
  CaptureSource,
  ConvertProgress,
  ConvertRequest,
  ExportResult,
  RecorderPhase,
  RecordingMeta,
  SaveRecordingRequest,
} from './ipc'

export type Unsubscribe = () => void

/**
 * The complete surface the renderer sees on `window.api`. Implemented by
 * the preload script over `contextBridge` — nothing else reaches the
 * renderer process.
 */
export interface RendererApi {
  ping(): Promise<'pong'>
  versions(): Promise<AppVersions>
  capabilities(): Promise<AppCapabilities>

  listSources(): Promise<CaptureSource[]>
  selectSource(selection: CaptureSelection): Promise<void>

  saveRecording(request: SaveRecordingRequest): Promise<RecordingMeta>
  setRecorderState(phase: RecorderPhase): Promise<void>

  listRecordings(): Promise<RecordingMeta[]>
  revealRecording(id: string): Promise<void>
  trashRecording(id: string): Promise<void>
  exportRecording(id: string): Promise<ExportResult>
  convertRecording(request: ConvertRequest): Promise<void>
  cancelConvert(jobId: string): Promise<void>

  getSettings(): Promise<AppSettings>
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  chooseSaveDirectory(): Promise<string | null>

  onConvertProgress(listener: (progress: ConvertProgress) => void): Unsubscribe
  onToggleRecording(listener: () => void): Unsubscribe
  onLibraryChanged(listener: () => void): Unsubscribe
}
