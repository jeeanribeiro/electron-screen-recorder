import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import type { AppSettings } from '@shared/ipc'
import { normalizeSettings } from '@shared/settings'

let cached: AppSettings | null = null

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): AppSettings {
  if (!cached) {
    let raw: unknown = null
    try {
      raw = JSON.parse(readFileSync(settingsFile(), 'utf8'))
    } catch {
      // First run or unreadable file — fall through to defaults.
    }
    cached = normalizeSettings(raw)
  }
  return cached
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = normalizeSettings({ ...getSettings(), ...patch })
  cached = next
  try {
    mkdirSync(dirname(settingsFile()), { recursive: true })
    writeFileSync(settingsFile(), JSON.stringify(next, null, 2), 'utf8')
  } catch (error) {
    console.error('Failed to persist settings:', error)
  }
  return next
}

export async function chooseSaveDirectory(win: BrowserWindow | null): Promise<string | null> {
  const options = {
    title: 'Choose recordings folder',
    properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>,
  }
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  const directory = result.canceled ? undefined : result.filePaths[0]
  if (!directory) return null
  updateSettings({ saveDirectory: directory })
  return directory
}
