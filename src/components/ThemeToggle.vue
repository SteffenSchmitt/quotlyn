<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { isDark } from '../lib/theme'
import { useSettingsStore } from '../stores/settings'

/**
 * Sun/moon pill that mirrors the applied theme. A click pins light or dark explicitly;
 * "system" stays available under Settings to follow the OS again.
 */
const { t } = useI18n()
const settings = useSettingsStore()

function toggle() {
  settings.update({ theme: isDark.value ? 'light' : 'dark' })
}
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="isDark"
    :aria-label="t('theme.toggle')"
    :title="isDark ? t('theme.toLight') : t('theme.toDark')"
    class="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border bg-white transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
    @click="toggle"
  >
    <span
      class="absolute top-0.5 left-0.5 h-[26px] w-[26px] rounded-full bg-slate-800 shadow transition-transform duration-200 motion-reduce:transition-none dark:bg-slate-200"
      :class="isDark ? 'translate-x-6' : 'translate-x-0'"
      aria-hidden="true"
    />
    <span class="relative z-10 flex w-full justify-between px-1.5" aria-hidden="true">
      <svg viewBox="0 0 20 20" class="h-4 w-4 transition-colors" :class="isDark ? 'text-slate-500' : 'text-amber-300'" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="10" cy="10" r="3.5" />
        <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
      </svg>
      <svg viewBox="0 0 20 20" class="h-4 w-4 transition-colors" :class="isDark ? 'text-slate-800' : 'text-slate-400'" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" />
      </svg>
    </span>
  </button>
</template>
