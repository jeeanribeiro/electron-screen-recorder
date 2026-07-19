import { desktopCapturer } from 'electron'
import type { CaptureSelection, CaptureSource } from '@shared/ipc'
import { APP_TITLE } from './window'

/**
 * The renderer never sees raw desktopCapturer sources. It gets a serialized
 * snapshot (id + name + thumbnail data URL) and picks one; the actual media
 * stream is granted by the display-media request handler in index.ts.
 */

let pending: CaptureSelection | null = null

export function setPendingSelection(selection: CaptureSelection): void {
  pending = {
    sourceId: String(selection.sourceId),
    systemAudio: selection.systemAudio === true,
    frameRate: Number.isFinite(selection.frameRate) ? selection.frameRate : 30,
  }
}

/** One-shot read: a selection authorizes exactly one getDisplayMedia call. */
export function takePendingSelection(): CaptureSelection | null {
  const selection = pending
  pending = null
  return selection
}

export async function listSources(): Promise<CaptureSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 384, height: 216 },
    fetchWindowIcons: true,
  })
  return sources
    .filter((source) => source.name !== APP_TITLE)
    .map((source) => ({
      id: source.id,
      name: source.name,
      kind: source.id.startsWith('screen') ? ('screen' as const) : ('window' as const),
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null,
    }))
}
