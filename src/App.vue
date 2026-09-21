<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Locale } from './i18n'

const { t, locale } = useI18n()
const locales: Locale[] = ['de', 'en']
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <header class="flex items-center justify-between border-b bg-white px-6 py-3">
      <div>
        <h1 class="text-xl font-semibold">{{ t('app.title') }}</h1>
        <p class="text-sm text-slate-500">{{ t('app.tagline') }}</p>
      </div>
      <select v-model="locale" class="rounded border px-2 py-1 text-sm">
        <option v-for="l in locales" :key="l" :value="l">{{ t(`lang.${l}`) }}</option>
      </select>
    </header>
    <main class="p-6">
      <RouterView />
    </main>
  </div>
</template>
