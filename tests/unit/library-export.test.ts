import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const recordingsRoot = mkdtempSync(join(tmpdir(), 'screenrec-export-'))
const showSaveDialog = vi.fn()

// The factories below run lazily, when `src/main/library` is imported —
// after the constants above exist.
vi.mock('electron', () => ({
  app: { getPath: () => recordingsRoot },
  dialog: { showSaveDialog },
  shell: { showItemInFolder: vi.fn(), trashItem: vi.fn() },
}))

vi.mock('../../src/main/ffmpeg', () => ({
  runFfmpeg: vi.fn(async () => undefined),
  startConvertJob: vi.fn(),
}))

vi.mock('../../src/main/settings', () => ({
  getSettings: () => ({
    format: 'webm' as const,
    frameRate: 30,
    saveDirectory: recordingsRoot,
    systemAudio: false,
    microphone: false,
  }),
}))

vi.mock('../../src/main/window', () => ({
  getMainWindow: () => null,
  sendToRenderer: vi.fn(),
}))

const { exportRecording } = await import('../../src/main/library')

describe('exportRecording', () => {
  beforeEach(() => {
    showSaveDialog.mockReset()
  })

  it('treats a cancelled dialog as a normal outcome, not a crash', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    const result = await exportRecording('recording.webm')
    expect(result).toEqual({ canceled: true, filePath: null, error: null })
  })

  it('survives a dialog that resolves without a filePath (the original crash)', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: undefined })
    const result = await exportRecording('recording.webm')
    expect(result).toEqual({ canceled: true, filePath: null, error: null })
  })

  it('copies the recording to the chosen destination', async () => {
    const source = join(recordingsRoot, 'take.webm')
    writeFileSync(source, 'webm-bytes')
    const destination = join(mkdtempSync(join(tmpdir(), 'screenrec-dest-')), 'copy.webm')
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: destination })

    const result = await exportRecording('take.webm')
    expect(result).toEqual({ canceled: false, filePath: destination, error: null })
    expect(readFileSync(destination, 'utf8')).toBe('webm-bytes')
  })

  it('surfaces write failures instead of throwing', async () => {
    const source = join(recordingsRoot, 'take2.webm')
    writeFileSync(source, 'webm-bytes')
    const destination = join(recordingsRoot, 'no-such-dir', 'nested', 'copy.webm')
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: destination })

    const result = await exportRecording('take2.webm')
    expect(result.canceled).toBe(false)
    expect(result.filePath).toBe(destination)
    expect(result.error).toBeTruthy()
  })

  it('rejects recording ids that try to escape the library directory', async () => {
    await expect(exportRecording('../evil.webm')).rejects.toThrow('Invalid recording id')
    await expect(exportRecording('')).rejects.toThrow('Invalid recording id')
    expect(showSaveDialog).not.toHaveBeenCalled()
  })
})
