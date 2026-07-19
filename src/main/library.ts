import { existsSync, mkdirSync } from 'node:fs'
import { copyFile, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { app, dialog, shell } from 'electron'
import { buildGifArgs, buildMp4Args, buildThumbnailArgs } from '@shared/ffmpeg-args'
import { recordingBaseName } from '@shared/format'
import type {
  ConvertRequest,
  ExportResult,
  RecordingFormat,
  RecordingMeta,
  SaveRecordingRequest,
} from '@shared/ipc'
import { runFfmpeg, startConvertJob } from './ffmpeg'
import { getSettings } from './settings'
import { getMainWindow, sendToRenderer } from './window'

/** Hidden folder inside the recordings directory for sidecars + thumbnails. */
const META_DIR = '.screenrec'

const EXTENSIONS: Record<string, RecordingFormat> = {
  '.webm': 'webm',
  '.mp4': 'mp4',
  '.gif': 'gif',
}

interface Sidecar {
  durationMs: number
  sourceName: string
  createdAt: number
}

export function recordingsDir(): string {
  const custom = getSettings().saveDirectory
  const testRoot = process.env.SCREEN_RECORDER_USER_DATA
  const dir =
    custom ??
    (testRoot ? join(testRoot, 'recordings') : join(app.getPath('videos'), 'Screen Recordings'))
  mkdirSync(join(dir, META_DIR), { recursive: true })
  return dir
}

/**
 * Recording ids arrive from the renderer over IPC. Even though the renderer
 * is ours, treat them as untrusted: an id must be a plain file name that
 * resolves inside the recordings directory.
 */
function assertLibraryFile(id: string): string {
  if (!id || id !== basename(id) || id.includes('..')) {
    throw new Error('Invalid recording id')
  }
  const dir = recordingsDir()
  const filePath = resolve(dir, id)
  if (dirname(filePath) !== resolve(dir)) {
    throw new Error('Invalid recording id')
  }
  return filePath
}

const metaPath = (id: string): string => join(recordingsDir(), META_DIR, `${id}.json`)
const thumbPath = (id: string): string => join(recordingsDir(), META_DIR, `${id}.png`)

async function readSidecar(id: string): Promise<Sidecar | null> {
  try {
    const raw = JSON.parse(await readFile(metaPath(id), 'utf8')) as Partial<Sidecar>
    return {
      durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : 0,
      sourceName: typeof raw.sourceName === 'string' ? raw.sourceName : '',
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    }
  } catch {
    return null
  }
}

async function readThumbnail(id: string): Promise<string | null> {
  try {
    const png = await readFile(thumbPath(id))
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return null
  }
}

async function generateThumbnail(input: string, output: string): Promise<void> {
  try {
    await runFfmpeg(buildThumbnailArgs(input, output, 0.5))
  } catch {
    // Very short clips have nothing at 0.5s — take the first frame instead.
    await runFfmpeg(buildThumbnailArgs(input, output, 0))
  }
}

function uniqueName(dir: string, base: string, ext: string): string {
  let name = `${base}.${ext}`
  let counter = 2
  while (existsSync(join(dir, name))) {
    name = `${base} (${counter}).${ext}`
    counter += 1
  }
  return name
}

export async function saveRecording(request: SaveRecordingRequest): Promise<RecordingMeta> {
  const dir = recordingsDir()
  const fileName = uniqueName(dir, recordingBaseName(new Date()), 'webm')
  const filePath = join(dir, fileName)
  const buffer = Buffer.from(request.buffer)
  await writeFile(filePath, buffer)

  const sidecar: Sidecar = {
    durationMs: Math.max(0, Math.round(request.durationMs)),
    sourceName: request.sourceName,
    createdAt: Date.now(),
  }
  await writeFile(metaPath(fileName), JSON.stringify(sidecar, null, 2), 'utf8')
  await generateThumbnail(filePath, thumbPath(fileName)).catch(() => undefined)

  sendToRenderer('event:library-changed')
  return {
    id: fileName,
    fileName,
    filePath,
    format: 'webm',
    sizeBytes: buffer.byteLength,
    durationMs: sidecar.durationMs,
    createdAt: sidecar.createdAt,
    sourceName: sidecar.sourceName,
    thumbnail: await readThumbnail(fileName),
  }
}

export async function listRecordings(): Promise<RecordingMeta[]> {
  const dir = recordingsDir()
  const entries = await readdir(dir, { withFileTypes: true })
  const recordings: RecordingMeta[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const format = EXTENSIONS[extname(entry.name).toLowerCase()]
    if (!format) continue
    const filePath = join(dir, entry.name)
    const stats = await stat(filePath)
    const sidecar = await readSidecar(entry.name)
    recordings.push({
      id: entry.name,
      fileName: entry.name,
      filePath,
      format,
      sizeBytes: stats.size,
      durationMs: sidecar?.durationMs ?? 0,
      createdAt: sidecar?.createdAt || Math.round(stats.mtimeMs),
      sourceName: sidecar?.sourceName ?? '',
      thumbnail: await readThumbnail(entry.name),
    })
  }
  recordings.sort((a, b) => b.createdAt - a.createdAt)
  return recordings
}

export async function revealRecording(id: string): Promise<void> {
  const filePath = assertLibraryFile(id)
  if (!existsSync(filePath)) throw new Error('Recording no longer exists')
  shell.showItemInFolder(filePath)
}

/** Moves the recording to the OS trash (never hard-deletes). */
export async function trashRecording(id: string): Promise<void> {
  const filePath = assertLibraryFile(id)
  await shell.trashItem(filePath)
  await rm(metaPath(id), { force: true })
  await rm(thumbPath(id), { force: true })
  sendToRenderer('event:library-changed')
}

/** "Save a copy" — the user picks a destination. */
export async function exportRecording(id: string): Promise<ExportResult> {
  const source = assertLibraryFile(id)
  const win = getMainWindow()
  const options = { buttonLabel: 'Save copy', defaultPath: id }
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)
  await copyFile(source, result.filePath as string)
  return { canceled: false, filePath: result.filePath ?? null, error: null }
}

export async function convertRecording(request: ConvertRequest): Promise<void> {
  const input = assertLibraryFile(request.id)
  if (!existsSync(input)) throw new Error('Recording no longer exists')
  const sidecar = await readSidecar(request.id)
  const dir = recordingsDir()
  const baseNoExt = request.id.replace(/\.[^.]+$/, '')
  const outputName = uniqueName(dir, baseNoExt, request.target)
  const output = join(dir, outputName)

  startConvertJob({
    jobId: `${request.id}=>${request.target}`,
    id: request.id,
    target: request.target,
    args: request.target === 'mp4' ? buildMp4Args(input, output) : buildGifArgs(input, output),
    durationMs: sidecar?.durationMs ?? 0,
    outputId: outputName,
    onDone: async () => {
      const outSidecar: Sidecar = {
        durationMs: sidecar?.durationMs ?? 0,
        sourceName: sidecar?.sourceName ?? '',
        createdAt: Date.now(),
      }
      await writeFile(metaPath(outputName), JSON.stringify(outSidecar, null, 2), 'utf8')
      await generateThumbnail(output, thumbPath(outputName)).catch(() => undefined)
      sendToRenderer('event:library-changed')
    },
  })
}
