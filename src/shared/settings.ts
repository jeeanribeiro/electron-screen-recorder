import type { AppSettings, RecordingFormat } from './ipc'

export const FRAME_RATES = [15, 24, 30, 60] as const
export const FORMATS: readonly RecordingFormat[] = ['webm', 'mp4', 'gif']

export const DEFAULT_SETTINGS: AppSettings = {
  format: 'webm',
  frameRate: 30,
  saveDirectory: null,
  systemAudio: false,
  microphone: false,
}

/**
 * Coerce anything read from disk (old versions, hand-edited files, garbage)
 * into a valid settings object. Unknown fields are dropped, invalid values
 * fall back to defaults.
 */
export function normalizeSettings(raw: unknown): AppSettings {
  const out: AppSettings = { ...DEFAULT_SETTINGS }
  if (typeof raw !== 'object' || raw === null) return out
  const source = raw as Record<string, unknown>

  if (typeof source.format === 'string' && FORMATS.includes(source.format as RecordingFormat)) {
    out.format = source.format as RecordingFormat
  }
  if (
    typeof source.frameRate === 'number' &&
    (FRAME_RATES as readonly number[]).includes(source.frameRate)
  ) {
    out.frameRate = source.frameRate as AppSettings['frameRate']
  }
  if (typeof source.saveDirectory === 'string' && source.saveDirectory.length > 0) {
    out.saveDirectory = source.saveDirectory
  }
  if (typeof source.systemAudio === 'boolean') out.systemAudio = source.systemAudio
  if (typeof source.microphone === 'boolean') out.microphone = source.microphone
  return out
}
