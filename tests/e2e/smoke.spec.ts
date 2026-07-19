/// <reference lib="dom" />
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import type { RendererApi } from '../../src/shared/api'

declare global {
  interface Window {
    api: RendererApi
  }
}

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'screenrec-e2e-'))
  app = await electron.launch({
    args: [join(__dirname, '..', '..'), ...(process.env.CI ? ['--no-sandbox'] : [])],
    env: { ...process.env, SCREEN_RECORDER_USER_DATA: dataDir },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app?.close()
})

test('launches a single window with the right identity', async () => {
  await expect(page).toHaveTitle('Screen Recorder')
  const windowCount = await app.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows().length
  )
  expect(windowCount).toBe(1)
})

test('renderer is fully sandboxed — no Node globals leak in', async () => {
  const leaks = await page.evaluate(() => {
    const scope = window as unknown as Record<string, unknown>
    return {
      require: typeof scope.require,
      process: typeof scope.process,
      Buffer: typeof scope.Buffer,
      ipcRenderer: typeof scope.ipcRenderer,
    }
  })
  expect(leaks).toEqual({
    require: 'undefined',
    process: 'undefined',
    Buffer: 'undefined',
    ipcRenderer: 'undefined',
  })
})

test('typed IPC bridge answers ping', async () => {
  expect(await page.evaluate(() => window.api.ping())).toBe('pong')
})

test('main process enumerates capture sources', async () => {
  const sources = await page.evaluate(() => window.api.listSources())
  expect(Array.isArray(sources)).toBe(true)
  for (const source of sources) {
    expect(source.id).toBeTruthy()
    expect(['screen', 'window']).toContain(source.kind)
    expect(source.thumbnail.startsWith('data:image/')).toBe(true)
  }
})

test('settings survive a round-trip through the main process', async () => {
  const updated = await page.evaluate(() => window.api.updateSettings({ frameRate: 60 }))
  expect(updated.frameRate).toBe(60)
  const reread = await page.evaluate(() => window.api.getSettings())
  expect(reread.frameRate).toBe(60)
})

test('library starts empty in a fresh profile', async () => {
  expect(await page.evaluate(() => window.api.listRecordings())).toEqual([])
})
