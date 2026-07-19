<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { ConvertProgress, ConvertTarget, RecordingMeta } from '@shared/ipc'
import { formatBytes, formatDuration } from '@shared/format'

const recordings = ref<RecordingMeta[]>([])
const jobs = ref<Record<string, ConvertProgress>>({})
const notice = ref<string | null>(null)
const loading = ref(true)

let unsubscribeChanged: (() => void) | null = null
let unsubscribeProgress: (() => void) | null = null
let noticeTimer: ReturnType<typeof setTimeout> | null = null

function showNotice(message: string): void {
  notice.value = message
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (notice.value = null), 6000)
}

async function load(): Promise<void> {
  try {
    recordings.value = await window.api.listRecordings()
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause))
  } finally {
    loading.value = false
  }
}

/** Active conversion for a given recording, if any. */
function jobFor(id: string): ConvertProgress | null {
  return Object.values(jobs.value).find((job) => job.id === id && !job.done) ?? null
}

const hasActiveJobs = computed(() => Object.values(jobs.value).some((job) => !job.done))

async function convert(recording: RecordingMeta, target: ConvertTarget): Promise<void> {
  try {
    await window.api.convertRecording({ id: recording.id, target })
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause))
  }
}

async function exportCopy(recording: RecordingMeta): Promise<void> {
  const result = await window.api.exportRecording(recording.id)
  if (result.error) showNotice(`Export failed: ${result.error}`)
  else if (!result.canceled && result.filePath) showNotice(`Saved copy to ${result.filePath}`)
}

async function reveal(recording: RecordingMeta): Promise<void> {
  try {
    await window.api.revealRecording(recording.id)
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause))
  }
}

async function trash(recording: RecordingMeta): Promise<void> {
  try {
    await window.api.trashRecording(recording.id)
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause))
  }
}

function cancelJob(job: ConvertProgress): void {
  void window.api.cancelConvert(job.jobId)
}

onMounted(() => {
  void load()
  unsubscribeChanged = window.api.onLibraryChanged(() => void load())
  unsubscribeProgress = window.api.onConvertProgress((progress) => {
    jobs.value = { ...jobs.value, [progress.jobId]: progress }
    if (progress.done) {
      if (progress.error) showNotice(`Conversion failed: ${progress.error}`)
      setTimeout(() => {
        const next = { ...jobs.value }
        delete next[progress.jobId]
        jobs.value = next
      }, 1200)
    }
  })
})

onUnmounted(() => {
  unsubscribeChanged?.()
  unsubscribeProgress?.()
  if (noticeTimer) clearTimeout(noticeTimer)
})
</script>

<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex items-center gap-3">
      <h2 class="text-sm font-medium text-mist">Recordings</h2>
      <span v-if="hasActiveJobs" class="text-xs text-accent">converting…</span>
      <span v-if="notice" class="ml-auto truncate text-xs text-mist" data-testid="library-notice">
        {{ notice }}
      </span>
    </div>

    <div
      v-if="!loading && recordings.length === 0"
      class="flex flex-1 flex-col items-center justify-center gap-2 text-mist"
    >
      <p class="text-sm">No recordings yet.</p>
      <p class="text-xs">Hit Record on the first tab — files land here as WebM.</p>
    </div>

    <ul v-else class="flex flex-col gap-2 overflow-y-auto pr-1">
      <li
        v-for="recording in recordings"
        :key="recording.id"
        data-testid="library-item"
        class="flex items-center gap-3 rounded-xl border border-edge bg-panel p-2.5"
      >
        <div class="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-ink">
          <img
            v-if="recording.thumbnail"
            :src="recording.thumbnail"
            alt=""
            class="h-full w-full object-cover"
            draggable="false"
          />
          <div v-else class="flex h-full items-center justify-center text-[10px] text-mist">
            {{ recording.format.toUpperCase() }}
          </div>
        </div>

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm" :title="recording.fileName">{{ recording.fileName }}</p>
          <p class="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-mist">
            <span class="rounded bg-panel-2 px-1.5 py-0.5 uppercase">{{ recording.format }}</span>
            <span v-if="recording.durationMs > 0">{{ formatDuration(recording.durationMs) }}</span>
            <span>{{ formatBytes(recording.sizeBytes) }}</span>
            <span v-if="recording.sourceName" class="truncate">{{ recording.sourceName }}</span>
          </p>
          <div v-if="jobFor(recording.id)" class="mt-1.5 flex items-center gap-2">
            <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2">
              <div
                class="h-full rounded-full bg-accent transition-all duration-300"
                :class="jobFor(recording.id)!.percent === null ? 'w-1/3 animate-pulse' : ''"
                :style="
                  jobFor(recording.id)!.percent !== null
                    ? { width: jobFor(recording.id)!.percent + '%' }
                    : {}
                "
              />
            </div>
            <span class="w-16 text-right text-xs text-mist tabular-nums">
              {{
                jobFor(recording.id)!.percent === null
                  ? jobFor(recording.id)!.target.toUpperCase()
                  : jobFor(recording.id)!.percent + '%'
              }}
            </span>
            <button
              class="text-xs text-mist hover:text-rec-soft"
              @click="cancelJob(jobFor(recording.id)!)"
            >
              Cancel
            </button>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-1.5">
          <template v-if="recording.format === 'webm' && !jobFor(recording.id)">
            <button
              class="rounded-lg border border-edge px-2.5 py-1 text-xs text-mist transition-colors hover:border-edge-2 hover:text-snow"
              title="Convert to MP4 (H.264)"
              @click="convert(recording, 'mp4')"
            >
              → MP4
            </button>
            <button
              class="rounded-lg border border-edge px-2.5 py-1 text-xs text-mist transition-colors hover:border-edge-2 hover:text-snow"
              title="Convert to animated GIF"
              @click="convert(recording, 'gif')"
            >
              → GIF
            </button>
          </template>
          <button
            class="rounded-lg border border-edge px-2.5 py-1 text-xs text-mist transition-colors hover:border-edge-2 hover:text-snow"
            title="Save a copy elsewhere"
            @click="exportCopy(recording)"
          >
            Save copy
          </button>
          <button
            class="rounded-lg border border-edge px-2.5 py-1 text-xs text-mist transition-colors hover:border-edge-2 hover:text-snow"
            title="Show in folder"
            @click="reveal(recording)"
          >
            Reveal
          </button>
          <button
            class="rounded-lg border border-edge px-2.5 py-1 text-xs text-mist transition-colors hover:border-rec/60 hover:text-rec-soft"
            title="Move to trash"
            @click="trash(recording)"
          >
            Trash
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
