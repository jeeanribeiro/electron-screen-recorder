import { describe, expect, it } from 'vitest'
import {
  buildGifArgs,
  buildMp4Args,
  buildThumbnailArgs,
  parseProgressChunk,
  progressPercent,
} from '@shared/ffmpeg-args'

describe('buildMp4Args', () => {
  const args = buildMp4Args('in.webm', 'out.mp4')

  it('encodes H.264 + AAC with faststart for instant playback start', () => {
    expect(args).toContain('libx264')
    expect(args).toContain('+faststart')
    expect(args).toContain('aac')
    expect(args.at(-1)).toBe('out.mp4')
  })

  it('forces even dimensions (yuv420p requirement)', () => {
    const vf = args[args.indexOf('-vf') + 1]
    expect(vf).toContain('trunc(iw/2)*2')
  })

  it('streams machine-readable progress on stdout', () => {
    expect(args).toContain('-progress')
    expect(args[args.indexOf('-progress') + 1]).toBe('pipe:1')
  })
})

describe('buildGifArgs', () => {
  it('uses a generated palette to avoid the 256-color banding', () => {
    const vf = buildGifArgs('in.webm', 'out.gif').join(' ')
    expect(vf).toContain('palettegen')
    expect(vf).toContain('paletteuse')
  })

  it('honours fps and max width options', () => {
    const args = buildGifArgs('in.webm', 'out.gif', { fps: 24, maxWidth: 480 })
    const vf = args[args.indexOf('-vf') + 1]
    expect(vf).toContain('fps=24')
    expect(vf).toContain("'min(480,iw)'")
  })

  it('never upscales small captures', () => {
    const vf = buildGifArgs('in.webm', 'out.gif')[
      buildGifArgs('in.webm', 'out.gif').indexOf('-vf') + 1
    ]
    expect(vf).toContain('min(960,iw)')
  })
})

describe('buildThumbnailArgs', () => {
  it('grabs a single downscaled frame', () => {
    const args = buildThumbnailArgs('in.webm', 'thumb.png')
    expect(args).toContain('-frames:v')
    expect(args).toContain('-ss')
  })

  it('omits the seek entirely for frame zero', () => {
    expect(buildThumbnailArgs('in.webm', 'thumb.png', 0)).not.toContain('-ss')
  })
})

describe('parseProgressChunk', () => {
  it('reads out_time_us (microseconds) into milliseconds', () => {
    const update = parseProgressChunk('frame=100\nout_time_us=2500000\nprogress=continue\n')
    expect(update.outTimeMs).toBe(2500)
    expect(update.end).toBe(false)
  })

  it('treats out_time_ms as microseconds too (long-standing ffmpeg quirk)', () => {
    expect(parseProgressChunk('out_time_ms=2500000\n').outTimeMs).toBe(2500)
  })

  it('detects the end marker', () => {
    expect(parseProgressChunk('progress=end\n').end).toBe(true)
  })

  it('ignores garbage values', () => {
    expect(parseProgressChunk('out_time_us=N/A\nnonsense\n').outTimeMs).toBeNull()
  })
})

describe('progressPercent', () => {
  it('computes percentage against the known duration', () => {
    expect(progressPercent(5000, 10_000)).toBe(50)
  })

  it('caps at 99 until ffmpeg confirms completion', () => {
    expect(progressPercent(20_000, 10_000)).toBe(99)
  })

  it('returns null when the duration is unknown', () => {
    expect(progressPercent(5000, 0)).toBeNull()
    expect(progressPercent(null, 10_000)).toBeNull()
  })
})
