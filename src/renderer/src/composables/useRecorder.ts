import { computed, onUnmounted, readonly, ref, watch } from 'vue'
import type { CaptureSource, RecorderPhase, RecordingMeta } from '@shared/ipc'

export interface RecordOptions {
  microphone: boolean
  systemAudio: boolean
  frameRate: number
}

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

function pickMimeType(): string {
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? 'video/webm'
}

/**
 * MediaRecorder pipeline: timeslice chunking, pause/resume with honest
 * elapsed-time accounting, live byte counter, and mic + system-audio mixing
 * through a single AudioContext destination.
 */
export function useRecorder() {
  const phase = ref<RecorderPhase>('idle')
  const error = ref<string | null>(null)
  const warning = ref<string | null>(null)
  const elapsedMs = ref(0)
  const bytesRecorded = ref(0)
  const lastRecording = ref<RecordingMeta | null>(null)
  const previewStream = ref<MediaStream | null>(null)
  const sourceName = ref('')

  let recorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let liveStreams: MediaStream[] = []
  let audioContext: AudioContext | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let startedAt = 0
  let pausedAccum = 0
  let pausedAt = 0

  const recording = computed(() => phase.value === 'recording' || phase.value === 'paused')

  watch(phase, (next) => {
    void window.api.setRecorderState(next)
  })

  function currentElapsed(): number {
    if (startedAt === 0) return 0
    const pausedTotal = pausedAccum + (phase.value === 'paused' ? performance.now() - pausedAt : 0)
    return Math.max(0, performance.now() - startedAt - pausedTotal)
  }

  function stopTracks(): void {
    for (const stream of liveStreams) {
      for (const track of stream.getTracks()) track.stop()
    }
    liveStreams = []
    if (audioContext) {
      void audioContext.close().catch(() => undefined)
      audioContext = null
    }
    previewStream.value = null
  }

  function mixStreams(display: MediaStream, mic: MediaStream | null): MediaStream {
    const videoTracks = display.getVideoTracks()
    const audioSources = [display, mic].filter(
      (stream): stream is MediaStream => stream !== null && stream.getAudioTracks().length > 0
    )
    if (audioSources.length === 0) return new MediaStream(videoTracks)
    if (audioSources.length === 1) {
      const only = audioSources[0]!
      return new MediaStream([...videoTracks, ...only.getAudioTracks()])
    }
    // Two audio inputs (system + mic): mix them into one track, because
    // WebM muxing only keeps the first audio track of a stream.
    audioContext = new AudioContext()
    const destination = audioContext.createMediaStreamDestination()
    for (const stream of audioSources) {
      audioContext.createMediaStreamSource(stream).connect(destination)
    }
    return new MediaStream([...videoTracks, ...destination.stream.getAudioTracks()])
  }

  async function start(source: CaptureSource, options: RecordOptions): Promise<void> {
    if (phase.value !== 'idle') return
    error.value = null
    warning.value = null

    // Reset per-take state: without this, take #2 would still contain the
    // chunks of take #1 (the bug the original version of this app shipped).
    chunks = []
    bytesRecorded.value = 0
    elapsedMs.value = 0
    lastRecording.value = null
    sourceName.value = source.name

    try {
      await window.api.selectSource({
        sourceId: source.id,
        systemAudio: options.systemAudio,
        frameRate: options.frameRate,
      })
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: options.frameRate, max: options.frameRate } },
        audio: options.systemAudio,
      })
      liveStreams.push(display)

      let mic: MediaStream | null = null
      if (options.microphone) {
        try {
          mic = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          })
          liveStreams.push(mic)
        } catch {
          warning.value = 'Microphone unavailable — recording without it.'
        }
      }

      const combined = mixStreams(display, mic)
      recorder = new MediaRecorder(combined, {
        mimeType: pickMimeType(),
        videoBitsPerSecond: 8_000_000,
      })
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
          bytesRecorded.value += event.data.size
        }
      }
      recorder.onstop = () => void finalize()
      display.getVideoTracks()[0]?.addEventListener('ended', () => stop())

      recorder.start(1000)
      startedAt = performance.now()
      pausedAccum = 0
      previewStream.value = display
      phase.value = 'recording'
      timer = setInterval(() => {
        elapsedMs.value = currentElapsed()
      }, 250)
    } catch (cause) {
      stopTracks()
      recorder = null
      phase.value = 'idle'
      error.value =
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Screen capture was denied by the system.'
          : cause instanceof Error
            ? cause.message
            : String(cause)
    }
  }

  function pause(): void {
    if (phase.value !== 'recording' || !recorder) return
    recorder.pause()
    pausedAt = performance.now()
    phase.value = 'paused'
  }

  function resume(): void {
    if (phase.value !== 'paused' || !recorder) return
    recorder.resume()
    pausedAccum += performance.now() - pausedAt
    phase.value = 'recording'
  }

  function stop(): void {
    if (!recorder || !recording.value) return
    if (phase.value === 'paused') {
      pausedAccum += performance.now() - pausedAt
    }
    elapsedMs.value = currentElapsed()
    phase.value = 'saving'
    recorder.stop()
  }

  async function finalize(): Promise<void> {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    const durationMs = Math.round(elapsedMs.value)
    const mimeType = recorder?.mimeType || 'video/webm'
    recorder = null
    startedAt = 0
    const blob = new Blob(chunks, { type: mimeType })
    chunks = []
    stopTracks()

    try {
      const buffer = await blob.arrayBuffer()
      const meta = await window.api.saveRecording({
        buffer,
        durationMs,
        sourceName: sourceName.value,
      })
      lastRecording.value = meta
      const settings = await window.api.getSettings()
      if (settings.format !== 'webm') {
        await window.api.convertRecording({ id: meta.id, target: settings.format })
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      phase.value = 'idle'
    }
  }

  onUnmounted(() => {
    if (timer) clearInterval(timer)
    stopTracks()
  })

  return {
    phase: readonly(phase),
    recording,
    error,
    warning,
    elapsedMs: readonly(elapsedMs),
    bytesRecorded: readonly(bytesRecorded),
    lastRecording,
    previewStream,
    sourceName: readonly(sourceName),
    start,
    pause,
    resume,
    stop,
  }
}
