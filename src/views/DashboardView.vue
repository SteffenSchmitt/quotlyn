<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const proxyState = ref<'idle' | 'ok' | 'fail'>('idle')

async function ping() {
  try {
    const res = await fetch('/api/healthz')
    proxyState.value = res.ok ? 'ok' : 'fail'
  } catch {
    proxyState.value = 'fail'
  }
}
</script>

<template>
  <section class="space-y-4">
    <p class="text-slate-500">{{ t('dashboard.empty') }}</p>
    <button class="rounded bg-slate-800 px-3 py-1 text-white" @click="ping">
      {{ t('dashboard.ping') }}
    </button>
    <p v-if="proxyState === 'ok'" class="text-green-600">{{ t('dashboard.proxyOk') }}</p>
    <p v-if="proxyState === 'fail'" class="text-red-600">{{ t('dashboard.proxyFail') }}</p>
  </section>
</template>
