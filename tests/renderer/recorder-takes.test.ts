import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RendererApi } from '@shared/api'
import type { CaptureSource, SaveRecordingRequest } from '@shared/ipc'
import { useRecorder } from '../../src/renderer/src/composables/useRecorder'

declare global {
  interface Window {
    api: RendererApi
  }
}

/**
 * Regression suite for the original app's worst bug: the chunk buffer was
 * never reset, so a second recording silently contained the first one too.
 * These tests drive the real `useRecorder` composable through two takes
 * against faked MediaRecorder/MediaStream primitives and assert the bytes
 * handed to the main process for take #2 contain only take #2.
 */

class FakeTrack {
  readonly kind: string
  stop = vi.fn()
  addEventListener = vi.fn()

  constructor(kind: string) {
    this.kind = kind
  }
}

class FakeMediaStream {
  private readonly tracks: FakeTrack[]

  constructor(tracks: FakeTrack[] | FakeMediaStream = []) {
    this.tracks = Array.isArray(tracks) ? tracks : tracks.getTracks()
  }

  getTracks(): FakeTrack[] {
    return this.tracks
  }

  getVideoTracks(): FakeTrack[] {
    return this.tracks.filter((track) => track.kind === 'video')
  }

  getAudioTracks(): FakeTrack[] {
    return this.tracks.filter((track) => track.kind === 'audio')
  }
}

const recorders: FakeMediaRecorder[] = []
const activeRecorder = (): FakeMediaRecorder | undefined => recorders[recorders.length - 1]

class FakeMediaRecorder {
  static isTypeSupported = (): boolean => true

  readonly mimeType: string
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onstop: (() => void) | null = null
  start = vi.fn()
  pause = vi.fn()
  resume = vi.fn()

  constructor(_stream: unknown, options: { mimeType?: string } = {}) {
    this.mimeType = options.mimeType ?? 'video/webm'
    recorders.push(this)
  }

  stop(): void {
    this.onstop?.()
  }

  emit(text: string): void {
    this.ondataavailable?.({ data: new Blob([text]) } as unknown as BlobEvent)
  }
}

const SOURCE: CaptureSource = {
  id: 'window:1:0',
  name: 'Demo window',
  kind: 'window',
  thumbnail: 'data:image/png;base64,',
  appIcon: null,
}

const OPTIONS = { microphone: false, systemAudio: false, frameRate: 30 }

const saved: SaveRecordingRequest[] = []

const api = {
  setRecorderState: vi.fn(async () => undefined),
  selectSource: vi.fn(async () => undefined),
  saveRecording: vi.fn(async (request: SaveRecordingRequest) => {
    saved.push(request)
    return {
      id: `take-${saved.length}.webm`,
      fileName: `take-${saved.length}.webm`,
      filePath: `/tmp/take-${saved.length}.webm`,
      format: 'webm' as const,
      sizeBytes: request.buffer.byteLength,
      durationMs: request.durationMs,
      createdAt: Date.now(),
      sourceName: request.sourceName,
      thumbnail: null,
    }
  }),
  getSettings: vi.fn(async () => ({
    format: 'webm' as const,
    frameRate: 30,
    saveDirectory: null,
    systemAudio: false,
    microphone: false,
  })),
}

async function recordOneTake(
  recorder: ReturnType<typeof useRecorder>,
  payload: string
): Promise<void> {
  await recorder.start(SOURCE, OPTIONS)
  expect(recorder.phase.value).toBe('recording')
  activeRecorder()?.emit(payload)
  const before = saved.length
  recorder.stop()
  await vi.waitFor(() => expect(saved.length).toBe(before + 1))
  expect(recorder.phase.value).toBe('idle')
}

describe('useRecorder across consecutive takes', () => {
  beforeEach(() => {
    saved.length = 0
    vi.stubGlobal('window', { api })
    vi.stubGlobal('MediaStream', FakeMediaStream)
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getDisplayMedia: vi.fn(async () => new FakeMediaStream([new FakeTrack('video')])),
        getUserMedia: vi.fn(async () => new FakeMediaStream([new FakeTrack('audio')])),
      },
    })
    // useRecorder registers onUnmounted; outside a component Vue warns once.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it('saves exactly the bytes of each take — take #2 never contains take #1', async () => {
    const recorder = useRecorder()

    await recordOneTake(recorder, 'chunks-of-take-one')
    expect(new TextDecoder().decode(saved[0]!.buffer)).toBe('chunks-of-take-one')

    await recordOneTake(recorder, 'chunks-of-take-two')
    const secondTake = new TextDecoder().decode(saved[1]!.buffer)
    expect(secondTake).toBe('chunks-of-take-two')
    expect(secondTake).not.toContain('chunks-of-take-one')
  })

  it('resets the live byte counter when a new take starts', async () => {
    const recorder = useRecorder()

    await recordOneTake(recorder, '0123456789')
    expect(recorder.bytesRecorded.value).toBe(10)

    await recorder.start(SOURCE, OPTIONS)
    expect(recorder.bytesRecorded.value).toBe(0)
    recorder.stop()
    await vi.waitFor(() => expect(recorder.phase.value).toBe('idle'))
  })
})
