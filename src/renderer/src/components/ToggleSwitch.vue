<script setup lang="ts">
defineProps<{
  modelValue: boolean
  label: string
  hint?: string | undefined
  disabled?: boolean | undefined
}>()

defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <label
    class="flex items-center gap-3"
    :class="disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'"
  >
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :disabled="disabled"
      class="relative h-5 w-9 shrink-0 rounded-full transition-colors"
      :class="modelValue ? 'bg-accent' : 'bg-edge'"
      @click="$emit('update:modelValue', !modelValue)"
    >
      <span
        class="absolute top-0.5 left-0.5 size-4 rounded-full bg-snow transition-transform"
        :class="modelValue ? 'translate-x-4' : ''"
      />
    </button>
    <span class="flex flex-col">
      <span class="text-sm">{{ label }}</span>
      <span v-if="hint" class="text-xs text-mist">{{ hint }}</span>
    </span>
  </label>
</template>
