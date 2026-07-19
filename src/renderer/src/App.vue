<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { AppCapabilities, AppSettings, AppVersions } from '@shared/ipc'
import LibraryPanel from './components/LibraryPanel.vue'
import RecordPanel from './components/RecordPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'

type Tab = 'record' | 'library' | 'settings'

const tab = ref<Tab>('record')
const settings = ref<AppSettings | null>(null)
const capabilities = ref<AppCapabilities | null>(null)
const versions = ref<AppVersions | null>(null)
const recordingActive = ref(false)

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'record', label: 'Record' },
  { id: 'library', label: 'Library' },
  { id: 'settings', label: 'Settings' },
]

onMounted(async () => {
  const [loadedSettings, loadedCapabilities, loadedVersions] = await Promise.all([
    window.api.getSettings(),
    window.api.capabilities(),
    window.api.versions(),
  ])
  settings.value = loadedSettings
  capabilities.value = loadedCapabilities
  versions.value = loadedVersions
})

async function applySettings(patch: Partial<AppSettings>): Promise<void> {
  settings.value = await window.api.updateSettings(patch)
}

function focusRecordTab(): void {
  tab.value = 'record'
}
</script>

<template>
  <div v-if="settings && capabilities" class="flex h-full flex-col">
    <header class="flex items-center gap-1 border-b border-edge bg-panel px-4 py-2 select-none">
      <div class="mr-3 flex items-center gap-2">
        <span
          class="inline-block size-3 rounded-full"
          :class="recordingActive ? 'bg-rec rec-pulse' : 'bg-rec/80'"
        />
        <h1 class="text-sm font-semibold tracking-wide">Screen Recorder</h1>
      </div>
      <nav class="flex gap-1">
        <button
          v-for="entry in TABS"
          :key="entry.id"
          :data-testid="`tab-${entry.id}`"
          class="rounded-md px-3 py-1 text-sm transition-colors"
          :class="
            tab === entry.id
              ? 'bg-panel-2 text-snow'
              : 'text-mist hover:bg-panel-2/60 hover:text-snow'
          "
          @click="tab = entry.id"
        >
          {{ entry.label }}
        </button>
      </nav>
      <span v-if="versions" class="ml-auto text-xs text-mist/70">v{{ versions.app }}</span>
    </header>

    <main class="min-h-0 flex-1 overflow-y-auto">
      <RecordPanel
        v-show="tab === 'record'"
        :settings="settings"
        :capabilities="capabilities"
        @recording-active="recordingActive = $event"
        @focus-record="focusRecordTab"
      />
      <LibraryPanel v-show="tab === 'library'" />
      <SettingsPanel
        v-show="tab === 'settings'"
        :settings="settings"
        :capabilities="capabilities"
        :versions="versions"
        @update="applySettings"
      />
    </main>
  </div>
</template>
