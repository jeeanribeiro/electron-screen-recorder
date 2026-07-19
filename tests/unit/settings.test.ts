import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from '@shared/settings'

describe('normalizeSettings', () => {
  it('returns defaults for anything that is not an object', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('webm')).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings(42)).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid values', () => {
    const result = normalizeSettings({
      format: 'mp4',
      frameRate: 60,
      saveDirectory: 'D:/captures',
      systemAudio: true,
      microphone: true,
    })
    expect(result).toEqual({
      format: 'mp4',
      frameRate: 60,
      saveDirectory: 'D:/captures',
      systemAudio: true,
      microphone: true,
    })
  })

  it('replaces invalid values with defaults field by field', () => {
    const result = normalizeSettings({
      format: 'avi',
      frameRate: 144,
      saveDirectory: '',
      systemAudio: 'yes',
      microphone: true,
    })
    expect(result.format).toBe(DEFAULT_SETTINGS.format)
    expect(result.frameRate).toBe(DEFAULT_SETTINGS.frameRate)
    expect(result.saveDirectory).toBeNull()
    expect(result.systemAudio).toBe(DEFAULT_SETTINGS.systemAudio)
    expect(result.microphone).toBe(true)
  })

  it('drops unknown fields', () => {
    const result = normalizeSettings({ format: 'gif', legacyOption: true })
    expect(result).not.toHaveProperty('legacyOption')
    expect(result.format).toBe('gif')
  })

  it('never returns a shared reference to the defaults', () => {
    const first = normalizeSettings(null)
    first.format = 'gif'
    expect(normalizeSettings(null).format).toBe(DEFAULT_SETTINGS.format)
  })
})
