<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { AppCapabilities, AppSettings, CaptureSource } from '@shared/ipc'
import { formatBytes, formatDuration } from '@shared/format'
import { useRecorder } from '../composables/useRecorder'
import ToggleSwitch from './ToggleSwitch.vue'

const props = defineProps<{
  settings: AppSettings
  capabilities: AppCapabilities
}>()

const emit = defineEmits<{
  'recording-active': [active: boolean]
  'focus-record': []
}>()

const recorder = useRecorder()
const sources = ref<CaptureSource[]>([])
const selectedId = ref<string | null>(null)
const kindFilter = ref<'all' | 'screen' | 'window'>('all')
const sourcesError = ref<string | null>(null)
const previewVideo = ref<HTMLVideoElement | null>(null)

const microphone = ref(props.settings.microphone)
const systemAudio = ref(props.settings.systemAudio && props.capabilities.systemAudio)

const visibleSources = computed(() =>
  kindFilter.value === 'all'
    ? sources.value
    : sources.value.filter((source) => source.kind === kindFilter.value)
)

const selectedSource = computed(
  () => sources.value.find((source) => source.id === selectedId.value) ?? null
)

let pollTimer: ReturnType<typeof setInterval> | null = null
let unsubscribeToggle: (() => void) | null = null

/**
 * Live thumbnails: while idle, re-list sources every 1.5s. Existing cards
 * are updated in place so the selection and grid order stay stable.
 */
async function refreshSources(): Promise<void> {
  try {
    const list = await window.api.listSources()
    sourcesError.value = null
    sources.value = list
    if (selectedId.value && !list.some((source) => source.id === selectedId.value)) {
      selectedId.value = null
    }
    if (!selectedId.value) {
      selectedId.value = list.find((source) => source.kind === 'screen')?.id ?? list[0]?.id ?? null
    }
  } catch (cause) {
    sourcesError.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function startRecording(): Promise<void> {
  const source = selectedSource.value
  if (!source) return
  await recorder.start(source, {
    microphone: microphone.value,
    systemAudio: systemAudio.value && props.capabilities.systemAudio,
    frameRate: props.settings.frameRate,
  })
}

function revealLastRecording(): void {
  const meta = recorder.lastRecording.value
  if (meta) void window.api.revealRecording(meta.id)
}

function toggleFromShortcut(): void {
  if (recorder.recording.value) {
    recorder.stop()
  } else if (recorder.phase.value === 'idle') {
    emit('focus-record')
    void startRecording()
  }
}

watch(
  () => recorder.recording.value,
  (active) => emit('recording-active', active)
)

watch(
  [() => recorder.previewStream.value, previewVideo],
  ([stream, video]) => {
    if (video) video.srcObject = stream
  },
  { flush: 'post' }
)

onMounted(() => {
  void refreshSources()
  pollTimer = setInterval(() => {
    if (recorder.phase.value === 'idle') void refreshSources()
  }, 1500)
  unsubscribeToggle = window.api.onToggleRecording(toggleFromShortcut)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  unsubscribeToggle?.()
})
</script>

<template>
  <div class="flex h-full flex-col gap-4 p-4">
    <!-- Idle: source picker -->
    <template v-if="!recorder.recording.value">
      <div class="flex items-center gap-2">
        <h2 class="text-sm font-medium text-mist">Choose what to record</h2>
        <div class="ml-auto flex gap-1 rounded-lg bg-panel p-0.5">
          <button
            v-for="option in ['all', 'screen', 'window'] as const"
            :key="option"
            class="rounded-md px-2.5 py-0.5 text-xs capitalize transition-colors"
            :class="kindFilter === option ? 'bg-panel-2 text-snow' : 'text-mist hover:text-snow'"
            @click="kindFilter = option"
          >
            {{ option === 'all' ? 'All' : option + 's' }}
          </button>
        </div>
      </div>

      <p v-if="sourcesError" class="rounded-lg bg-rec/10 px-3 py-2 text-sm text-rec-soft">
        {{ sourcesError }}
      </p>

      <div class="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto pr-1 lg:grid-cols-3">
        <button
          v-for="source in visibleSources"
          :key="source.id"
          data-testid="source-card"
          class="group flex flex-col overflow-hidden rounded-xl border text-left transition-all"
          :class="
            selectedId === source.id
              ? 'border-accent bg-panel-2 ring-1 ring-accent/60'
              : 'border-edge bg-panel hover:border-edge-2'
          "
          @click="selectedId = source.id"
        >
          <div class="relative aspect-video w-full overflow-hidden bg-ink">
            <img
              :src="source.thumbnail"
              :alt="source.name"
              class="h-full w-full object-contain"
              draggable="false"
            />
            <span
              class="absolute top-1.5 left-1.5 rounded-md bg-ink/80 px-1.5 py-0.5 text-[10px] tracking-wide text-mist uppercase"
            >
              {{ source.kind }}
            </span>
          </div>
          <div class="flex items-center gap-1.5 px-2.5 py-2">
            <img
              v-if="source.appIcon"
              :src="source.appIcon"
              alt=""
              class="size-4 shrink-0"
              draggable="false"
            />
            <span class="truncate text-xs" :title="source.name">{{ source.name }}</span>
          </div>
        </button>
      </div>

      <div
        class="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-edge bg-panel px-4 py-3"
      >
        <ToggleSwitch v-model="microphone" label="Microphone" />
        <ToggleSwitch
          v-model="systemAudio"
          label="System audio"
          :disabled="!capabilities.systemAudio"
          :hint="capabilities.systemAudio ? undefined : 'Not supported on this OS'"
        />
        <span class="text-xs text-mist">{{ settings.frameRate }} fps</span>
        <div class="ml-auto flex items-center gap-3">
          <span v-if="recorder.error.value" class="max-w-72 truncate text-xs text-rec-soft">
            {{ recorder.error.value }}
          </span>
          <span class="hidden text-xs text-mist sm:inline">Ctrl/Cmd+Shift+R</span>
          <button
            data-testid="record-button"
            class="flex items-center gap-2 rounded-lg bg-rec px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-rec-soft disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!selectedSource || recorder.phase.value !== 'idle'"
            @click="startRecording"
          >
            <span class="inline-block size-2.5 rounded-full bg-white" />
            {{ recorder.phase.value === 'saving' ? 'Saving…' : 'Record' }}
          </button>
        </div>
      </div>
    </template>

    <!-- Recording: live preview + controls -->
    <template v-else>
      <div
        data-testid="recording-controls"
        class="flex items-center gap-4 rounded-xl border border-edge bg-panel px-4 py-3"
      >
        <span class="flex items-center gap-2 text-sm font-medium">
          <span
            class="inline-block size-3 rounded-full bg-rec"
            :class="recorder.phase.value === 'recording' ? 'rec-pulse' : 'opacity-50'"
          />
          {{ recorder.phase.value === 'paused' ? 'Paused' : 'Recording' }}
        </span>
        <span data-testid="timer" class="font-mono text-lg tabular-nums">
          {{ formatDuration(recorder.elapsedMs.value) }}
        </span>
        <span class="text-sm text-mist">≈ {{ formatBytes(recorder.bytesRecorded.value) }}</span>
        <span class="truncate text-xs text-mist/80">{{ recorder.sourceName.value }}</span>
        <div class="ml-auto flex items-center gap-2">
          <button
            v-if="recorder.phase.value === 'recording'"
            data-testid="pause-button"
            class="rounded-lg border border-edge bg-panel-2 px-4 py-1.5 text-sm transition-colors hover:border-edge-2"
            @click="recorder.pause"
          >
            Pause
          </button>
          <button
            v-else
            data-testid="resume-button"
            class="rounded-lg border border-edge bg-panel-2 px-4 py-1.5 text-sm transition-colors hover:border-edge-2"
            @click="recorder.resume"
          >
            Resume
          </button>
          <button
            data-testid="stop-button"
            class="rounded-lg bg-rec px-5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-rec-soft"
            @click="recorder.stop"
          >
            Stop
          </button>
        </div>
      </div>

      <div
        class="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-edge bg-ink"
      >
        <video ref="previewVideo" autoplay muted playsinline class="max-h-full max-w-full" />
      </div>
    </template>

    <p v-if="recorder.warning.value" class="text-xs text-mist">{{ recorder.warning.value }}</p>
    <p
      v-if="recorder.lastRecording.value && recorder.phase.value === 'idle'"
      class="flex items-center gap-2 text-xs text-ok"
    >
      Saved {{ recorder.lastRecording.value.fileName }}
      <button
        class="text-mist underline-offset-2 hover:text-snow hover:underline"
        @click="revealLastRecording"
      >
        Show in folder
      </button>
    </p>
  </div>
</template>
