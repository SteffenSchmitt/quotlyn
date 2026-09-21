<script setup lang="ts">
import { watch } from 'vue'
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
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <header class="flex items-center justify-between border-b bg-white px-6 py-3">
      <div class="flex items-center gap-6">
        <div>
          <h1 class="text-xl font-semibold">{{ t('app.title') }}</h1>
          <p class="text-sm text-slate-500">{{ t('app.tagline') }}</p>
        </div>
        <nav v-if="store.status === 'unlocked'" class="flex gap-4 text-sm">
          <RouterLink to="/" class="hover:underline" active-class="font-semibold">{{ t('nav.dashboard') }}</RouterLink>
          <RouterLink to="/history" class="hover:underline" active-class="font-semibold">
            {{ t('nav.history') }}
          </RouterLink>
          <RouterLink to="/timeline" class="hover:underline" active-class="font-semibold">
            {{ t('nav.timeline') }}
          </RouterLink>
          <RouterLink to="/accounts" class="hover:underline" active-class="font-semibold">
            {{ t('nav.accounts') }}
          </RouterLink>
        </nav>
      </div>
      <div class="flex items-center gap-3">
        <button v-if="store.status === 'unlocked'" class="rounded border px-2 py-1 text-sm" @click="store.lock()">
          {{ t('vault.lock') }}
        </button>
        <select v-model="locale" class="rounded border px-2 py-1 text-sm">
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
