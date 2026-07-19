import { describe, expect, it } from 'vitest'
import { formatBytes, formatDuration, recordingBaseName } from '@shared/format'

describe('formatBytes', () => {
  it('formats across magnitudes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(999)).toBe('999 B')
    expect(formatBytes(12_400)).toBe('12.1 KB')
    expect(formatBytes(3_250_000)).toBe('3.1 MB')
    expect(formatBytes(1_073_741_824)).toBe('1.0 GB')
  })

  it('drops decimals for three-digit values', () => {
    expect(formatBytes(150 * 1024)).toBe('150 KB')
  })

  it('is defensive about garbage input', () => {
    expect(formatBytes(-5)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
  })
})

describe('formatDuration', () => {
  it('formats mm:ss under an hour', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(65_000)).toBe('01:05')
    expect(formatDuration(59 * 60_000 + 59_000)).toBe('59:59')
  })

  it('adds the hour segment past 60 minutes', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00')
    expect(formatDuration(3_600_000 + 61_000)).toBe('1:01:01')
  })

  it('clamps negatives to zero', () => {
    expect(formatDuration(-100)).toBe('00:00')
  })
})

describe('recordingBaseName', () => {
  const name = recordingBaseName(new Date(2026, 6, 19, 15, 30, 5))

  it('is a stable timestamped name', () => {
    expect(name).toBe('Recording 2026-07-19 15-30-05')
  })

  it('never contains characters Windows rejects in file names', () => {
    expect(name).not.toMatch(/[<>:"/\\|?*]/)
  })
})
