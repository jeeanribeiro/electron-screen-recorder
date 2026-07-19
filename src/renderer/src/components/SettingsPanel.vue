<script setup lang="ts">
import type { AppCapabilities, AppSettings, AppVersions } from '@shared/ipc'
import { FORMATS, FRAME_RATES } from '@shared/settings'
import ToggleSwitch from './ToggleSwitch.vue'

const props = defineProps<{
  settings: AppSettings
  capabilities: AppCapabilities
  versions: AppVersions | null
}>()

const emit = defineEmits<{ update: [patch: Partial<AppSettings>] }>()

const FORMAT_HINTS: Record<AppSettings['format'], string> = {
  webm: 'Saved instantly, no re-encode',
  mp4: 'H.264 — converts after each recording',
  gif: 'Animated GIF — converts after each recording',
}

async function chooseDirectory(): Promise<void> {
  const directory = await window.api.chooseSaveDirectory()
  if (directory) emit('update', { saveDirectory: directory })
}

function resetDirectory(): void {
  emit('update', { saveDirectory: null })
}

function setFormat(event: Event): void {
  emit('update', { format: (event.target as HTMLSelectElement).value as AppSettings['format'] })
}

function setFrameRate(event: Event): void {
  emit('update', {
    frameRate: Number((event.target as HTMLSelectElement).value) as AppSettings['frameRate'],
  })
}
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-4 p-4">
    <section class="rounded-xl border border-edge bg-panel p-4">
      <h2 class="mb-3 text-sm font-medium text-mist">Recording</h2>
      <div class="flex flex-col gap-4">
        <label class="flex items-center justify-between gap-4">
          <span class="flex flex-col">
            <span class="text-sm">Keep recordings as</span>
            <span class="text-xs text-mist">{{ FORMAT_HINTS[props.settings.format] }}</span>
          </span>
          <select
            class="rounded-lg border border-edge bg-panel-2 px-3 py-1.5 text-sm uppercase"
            :value="props.settings.format"
            data-testid="format-select"
            @change="setFormat"
          >
            <option v-for="format in FORMATS" :key="format" :value="format">
              {{ format }}
            </option>
          </select>
        </label>

        <label class="flex items-center justify-between gap-4">
          <span class="text-sm">Frame rate</span>
          <select
            class="rounded-lg border border-edge bg-panel-2 px-3 py-1.5 text-sm"
            :value="props.settings.frameRate"
            @change="setFrameRate"
          >
            <option v-for="rate in FRAME_RATES" :key="rate" :value="rate">{{ rate }} fps</option>
          </select>
        </label>

        <ToggleSwitch
          :model-value="props.settings.microphone"
          label="Microphone on by default"
          @update:model-value="emit('update', { microphone: $event })"
        />
        <ToggleSwitch
          :model-value="props.settings.systemAudio"
          label="System audio on by default"
          :disabled="!props.capabilities.systemAudio"
          :hint="
            props.capabilities.systemAudio
              ? 'OS loopback capture'
              : 'Not supported on this OS — see the support matrix in the README'
          "
          @update:model-value="emit('update', { systemAudio: $event })"
        />
      </div>
    </section>

    <section class="rounded-xl border border-edge bg-panel p-4">
      <h2 class="mb-3 text-sm font-medium text-mist">Storage</h2>
      <div class="flex items-center gap-2">
        <p class="min-w-0 flex-1 truncate text-sm" :title="props.settings.saveDirectory ?? ''">
          {{ props.settings.saveDirectory ?? 'Videos › Screen Recordings (default)' }}
        </p>
        <button
          class="rounded-lg border border-edge px-3 py-1.5 text-xs text-mist transition-colors hover:border-edge-2 hover:text-snow"
          @click="chooseDirectory"
        >
          Choose…
        </button>
        <button
          v-if="props.settings.saveDirectory"
          class="rounded-lg border border-edge px-3 py-1.5 text-xs text-mist transition-colors hover:border-edge-2 hover:text-snow"
          @click="resetDirectory"
        >
          Reset
        </button>
      </div>
    </section>

    <section class="rounded-xl border border-edge bg-panel p-4">
      <h2 class="mb-3 text-sm font-medium text-mist">Shortcuts</h2>
      <p class="text-sm">
        <kbd class="rounded-md border border-edge bg-panel-2 px-2 py-0.5 font-mono text-xs">
          Ctrl/Cmd + Shift + R
        </kbd>
        <span class="ml-2 text-mist">Start or stop recording from anywhere</span>
      </p>
    </section>

    <section v-if="props.versions" class="rounded-xl border border-edge bg-panel p-4">
      <h2 class="mb-3 text-sm font-medium text-mist">About</h2>
      <p class="text-xs text-mist">
        Screen Recorder v{{ props.versions.app }} · Electron {{ props.versions.electron }} ·
        Chromium {{ props.versions.chrome }} · Node {{ props.versions.node }}
      </p>
      <p class="mt-1 text-xs text-mist">
        Updates install automatically from GitHub Releases where the platform allows it.
      </p>
    </section>
  </div>
</template>
