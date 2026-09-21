<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

/**
 * Small (i) control that reveals a short explanation on hover, focus or tap.
 * Always the last element of a flex row: it pushes itself to the right edge and keeps
 * an 8px gap to whatever precedes it.
 */
const props = defineProps<{ text: string; label?: string }>()
const open = ref(false)
const id = `tip-${Math.random().toString(36).slice(2, 9)}`

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
document.addEventListener('keydown', onKey)
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <span class="relative ml-auto inline-flex shrink-0 pl-2 align-middle">
    <button
      type="button"
      class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 text-[10px] font-bold leading-none text-slate-500 hover:border-slate-600 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-500 dark:text-slate-400 dark:hover:border-slate-300 dark:hover:text-slate-200"
      :aria-label="props.label ?? 'Info'"
      :aria-describedby="open ? id : undefined"
      :aria-expanded="open"
      @mouseenter="open = true"
      @mouseleave="open = false"
      @focus="open = true"
      @blur="open = false"
      @click.stop="open = !open"
    >
      i
    </button>
    <span
      v-if="open"
      :id="id"
      role="tooltip"
      class="absolute left-1/2 top-full z-20 mt-1.5 w-max max-w-64 -translate-x-1/2 rounded-md bg-slate-900 px-2.5 py-1.5 text-left text-xs font-normal leading-snug text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
    >
      {{ props.text }}
    </span>
  </span>
</template>
