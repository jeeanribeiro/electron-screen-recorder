/**
 * Pure ffmpeg argument builders and progress parsing. No Electron imports —
 * everything here is unit-testable in plain Node.
 */

/** Even-dimension guard: H.264 yuv420p requires width/height % 2 === 0. */
const EVEN_SCALE = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'

/** Progress reporting flags shared by every conversion. */
const PROGRESS_FLAGS = ['-progress', 'pipe:1', '-nostats', '-loglevel', 'error']

export function buildMp4Args(input: string, output: string): string[] {
  return [
    '-y',
    '-i',
    input,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-vf',
    EVEN_SCALE,
    '-movflags',
    '+faststart',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    ...PROGRESS_FLAGS,
    output,
  ]
}

export interface GifOptions {
  fps?: number
  maxWidth?: number
}

/** Single-pass palette GIF: palettegen + paletteuse via split. */
export function buildGifArgs(input: string, output: string, options: GifOptions = {}): string[] {
  const fps = options.fps ?? 12
  const maxWidth = options.maxWidth ?? 960
  const filter =
    `fps=${fps},scale='min(${maxWidth},iw)':-2:flags=lanczos,` +
    'split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer'
  return ['-y', '-i', input, '-vf', filter, '-loop', '0', ...PROGRESS_FLAGS, output]
}

/** Single-frame poster used for library thumbnails. */
export function buildThumbnailArgs(input: string, output: string, seekSeconds = 0.5): string[] {
  const args = ['-y', '-i', input]
  if (seekSeconds > 0) args.push('-ss', String(seekSeconds))
  args.push('-frames:v', '1', '-vf', 'scale=480:-2', output)
  return args
}

export interface ProgressUpdate {
  /** Output timestamp in milliseconds, if present in this chunk. */
  outTimeMs: number | null
  /** True when ffmpeg reported `progress=end`. */
  end: boolean
}

/**
 * Parse a chunk of `-progress pipe:1` output (newline-separated key=value
 * pairs). Prefers `out_time_us`; falls back to `out_time_ms`, which —
 * despite the name — has always been microseconds too (a long-standing
 * ffmpeg quirk).
 */
export function parseProgressChunk(chunk: string): ProgressUpdate {
  let outTimeUs: number | null = null
  let end = false
  for (const line of chunk.split(/\r?\n/)) {
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (key === 'out_time_us' || key === 'out_time_ms') {
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed >= 0) outTimeUs = parsed
    } else if (key === 'progress' && value === 'end') {
      end = true
    }
  }
  return { outTimeMs: outTimeUs === null ? null : Math.round(outTimeUs / 1000), end }
}

/** Percent complete, clamped to [0, 99] until done; null without a duration. */
export function progressPercent(outTimeMs: number | null, durationMs: number): number | null {
  if (outTimeMs === null || !Number.isFinite(durationMs) || durationMs <= 0) return null
  return Math.max(0, Math.min(99, Math.round((outTimeMs / durationMs) * 100)))
}
