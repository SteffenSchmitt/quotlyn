<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { applyTheme, watchSystemTheme } from './lib/theme'
import { useI18n } from 'vue-i18n'
import type { Locale } from './i18n'
import PassphraseGate from './components/PassphraseGate.vue'
import { useAccountsStore } from './stores/accounts'
import { useSettingsStore } from './stores/settings'
import { useUsageStore } from './stores/usage'

const { t, locale } = useI18n()
const locales: Locale[] = ['de', 'en']
const store = useAccountsStore()
const settings = useSettingsStore()
settings.load()
const usage = useUsageStore()

watch(() => settings.settings.theme, applyTheme, { immediate: true })
let unwatchSystem = () => {}
onMounted(() => {
  unwatchSystem = watchSystemTheme(() => applyTheme(settings.settings.theme))
})
onUnmounted(() => unwatchSystem())

watch(
  () => settings.settings.locale,
  (l) => {
    locale.value = l === 'auto' ? (navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en') : l
  },
  { immediate: true },
)

watch(
  () => store.status,
  (s) => {
    if (s === 'unlocked') void usage.start()
    else usage.stop()
  },
  { immediate: true },
)
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <header class="flex flex-wrap items-center justify-between gap-y-2 border-b bg-white dark:border-slate-800 dark:bg-slate-900 px-6 py-3">
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <h1 class="text-lg font-bold">{{ t('app.title') }}</h1>
          <p class="text-xs text-slate-500">{{ t('app.tagline') }}</p>
        </div>
        <nav v-if="store.status === 'unlocked'" class="flex gap-4 text-sm">
          <RouterLink to="/" class="hover:underline" active-class="font-bold">{{ t('nav.dashboard') }}</RouterLink>
          <RouterLink to="/history" class="hover:underline" active-class="font-bold">
            {{ t('nav.history') }}
          </RouterLink>
          <RouterLink to="/timeline" class="hover:underline" active-class="font-bold">
            {{ t('nav.timeline') }}
          </RouterLink>
          <RouterLink to="/accounts" class="hover:underline" active-class="font-bold">
            {{ t('nav.accounts') }}
          </RouterLink>
          <RouterLink to="/settings" class="hover:underline" active-class="font-bold">
            {{ t('nav.settings') }}
          </RouterLink>
          <RouterLink to="/help" class="hover:underline" active-class="font-bold">
            {{ t('nav.help') }}
          </RouterLink>
        </nav>
      </div>
      <div class="flex items-center gap-3">
        <button v-if="store.status === 'unlocked'" class="btn-secondary" @click="store.lock()">
          {{ t('vault.lock') }}
        </button>
        <select
          :value="locale"
          class="field w-auto"
          @change="settings.update({ locale: ($event.target as HTMLSelectElement).value as 'de' | 'en' })"
        >
          <option v-for="l in locales" :key="l" :value="l">{{ t(`lang.${l}`) }}</option>
        </select>
      </div>
    </header>
    <main class="p-6">
      <PassphraseGate>
        <RouterView />
      </PassphraseGate>
    </main>
  </div>
</template>
