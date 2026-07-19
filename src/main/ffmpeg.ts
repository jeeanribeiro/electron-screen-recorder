import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import ffmpegStaticPath from 'ffmpeg-static'
import { parseProgressChunk, progressPercent } from '@shared/ffmpeg-args'
import type { ConvertProgress, ConvertTarget } from '@shared/ipc'
import { sendToRenderer } from './window'

/**
 * ffmpeg lives in node_modules/ffmpeg-static and is unpacked from the asar
 * archive at package time (see asarUnpack in electron-builder.yml), so the
 * same resolution works in dev and in the packaged app.
 */
function ffmpegBinary(): string {
  if (!ffmpegStaticPath) {
    throw new Error('ffmpeg-static did not provide a binary for this platform')
  }
  return ffmpegStaticPath.replace('app.asar', 'app.asar.unpacked')
}

/** Run ffmpeg to completion (used for thumbnails and other quick jobs). */
export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(ffmpegBinary(), args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr?.on('data', (data: Buffer) => {
      stderr = (stderr + String(data)).slice(-1000)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`))
    })
  })
}

export interface ConvertJob {
  jobId: string
  id: string
  target: ConvertTarget
  args: string[]
  /** Source duration; 0 = unknown (progress becomes indeterminate). */
  durationMs: number
  /** File name the finished conversion will appear under in the library. */
  outputId: string
  /** Runs after a successful conversion (sidecar + thumbnail + notify). */
  onDone: () => Promise<void>
}

const running = new Map<string, ChildProcess>()
const cancelled = new Set<string>()

/**
 * Long-running conversion: spawn ffmpeg with `-progress pipe:1`, stream
 * parsed progress to the renderer as `event:convert-progress` pushes.
 */
export function startConvertJob(job: ConvertJob): void {
  if (running.has(job.jobId)) return

  const emit = (progress: Partial<ConvertProgress>): void => {
    sendToRenderer('event:convert-progress', {
      jobId: job.jobId,
      id: job.id,
      target: job.target,
      percent: null,
      done: false,
      error: null,
      outputId: null,
      ...progress,
    })
  }

  let child: ChildProcess
  try {
    child = spawn(ffmpegBinary(), job.args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    emit({ done: true, error: error instanceof Error ? error.message : String(error) })
    return
  }
  running.set(job.jobId, child)
  emit({ percent: job.durationMs > 0 ? 0 : null })

  let stderrTail = ''
  child.stdout?.on('data', (data: Buffer) => {
    const update = parseProgressChunk(String(data))
    if (update.outTimeMs !== null) {
      emit({ percent: progressPercent(update.outTimeMs, job.durationMs) })
    }
  })
  child.stderr?.on('data', (data: Buffer) => {
    stderrTail = (stderrTail + String(data)).slice(-500)
  })
  child.on('error', (error) => {
    running.delete(job.jobId)
    emit({ done: true, error: error.message })
  })
  child.on('close', (code) => {
    running.delete(job.jobId)
    if (cancelled.delete(job.jobId)) {
      emit({ done: true, error: 'Conversion cancelled' })
      return
    }
    if (code === 0) {
      job
        .onDone()
        .then(() => emit({ percent: 100, done: true, outputId: job.outputId }))
        .catch((error: unknown) =>
          emit({ done: true, error: error instanceof Error ? error.message : String(error) })
        )
    } else {
      emit({
        done: true,
        error: `ffmpeg exited with code ${code}${stderrTail ? `: ${stderrTail.trim()}` : ''}`,
      })
    }
  })
}

export function cancelConvertJob(jobId: string): void {
  const child = running.get(jobId)
  if (child) {
    cancelled.add(jobId)
    child.kill()
  }
}
