<script setup lang="ts">
import { inject, ref } from 'vue'

const electron: any = inject('electron')
electron.initCapture()

const isCapturing = ref(false)

function handleStart(): void {
  electron.startCapture()
  isCapturing.value = true
}

function handleStop(): void {
  electron.stopCapture()
  isCapturing.value = false
}
</script>

<template>
  <button-container class="flex flex-wrap gap-8 justify-center items-center">
    <q-btn v-if="!isCapturing" color="primary" icon="fiber_manual_record" label="start recording" @click="handleStart" />
    <q-btn v-if="isCapturing" color="red" icon="stop_circle" label="stop recording" @click="handleStop" />
  </button-container>
</template>
