/**
 * Launches the built app and captures the README screenshots for real:
 * source picker -> live recording -> library. A throwaway Chromium window
 * with a demo page is used as the capture target so the shots are
 * reproducible on any desktop. Run `pnpm build` first.
 *
 *   node scripts/capture-screens.mjs
 */
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron, chromium } from '@playwright/test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'docs', 'assets')
mkdirSync(outDir, { recursive: true })

// A neutral, self-authored window to point the recorder at.
const DEMO_TITLE = 'Quarterly metrics — demo dashboard'
const browser = await chromium.launch({
  headless: false,
  args: ['--window-size=1280,840', '--window-position=120,80'],
})
const demo = await browser.newPage()
await demo.setContent(`<!doctype html><html><head><title>${DEMO_TITLE}</title></head>
<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
background:linear-gradient(135deg,#0f172a,#1e3a8a 55%,#0ea5e9);font-family:system-ui">
<div style="text-align:center;color:#e2e8f0">
<div style="font-size:56px;font-weight:700;letter-spacing:-1px">Demo dashboard</div>
<div style="margin-top:12px;font-size:22px;opacity:.75">Captured with Screen Recorder</div>
<div style="margin-top:40px;display:flex;gap:16px;justify-content:center">
${[68, 82, 45, 91].map((v) => `<div style="width:120px;padding:18px;border-radius:14px;background:rgba(255,255,255,.08)"><div style="font-size:34px;font-weight:600">${v}%</div><div style="font-size:13px;opacity:.6">metric</div></div>`).join('')}
</div></div></body></html>`)

const dataDir = mkdtempSync(join(tmpdir(), 'screenrec-shots-'))
const app = await _electron.launch({
  args: [root],
  env: { ...process.env, SCREEN_RECORDER_USER_DATA: dataDir },
})
const page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')

await app.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  win.setSize(1160, 760)
  win.center()
  win.focus()
})

// 1. Source picker with live thumbnails; select the demo window
await page.waitForSelector('[data-testid="source-card"]', { timeout: 20_000 })
const demoCard = page.locator('[data-testid="source-card"]', { hasText: 'demo dashboard' })
await demoCard.first().waitFor({ timeout: 20_000 })
await demoCard.first().click()
await page.waitForTimeout(1600)
await page.screenshot({ path: join(outDir, 'source-picker.png') })
console.log('captured source-picker.png')

// 2. Live recording (timer + size readout + preview)
await page.click('[data-testid="record-button"]')
await page.waitForSelector('[data-testid="recording-controls"]', { timeout: 20_000 })
await page.waitForTimeout(3400)
await page.screenshot({ path: join(outDir, 'recording.png') })
console.log('captured recording.png')

// 3. Stop, then the library with the fresh recording + thumbnail
await page.click('[data-testid="stop-button"]')
await page.waitForSelector('[data-testid="record-button"]', { timeout: 30_000 })
await page.click('[data-testid="tab-library"]')
await page.waitForSelector('[data-testid="library-item"]', { timeout: 20_000 })
await page.waitForTimeout(800)
await page.screenshot({ path: join(outDir, 'library.png') })
console.log('captured library.png')

await app.close()
await browser.close()
