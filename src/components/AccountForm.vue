<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchUsage } from '../api/usageClient'
import type { Account, NewAccount } from '../stores/accounts'

const props = defineProps<{ account?: Account }>()
const emit = defineEmits<{
  save: [value: Required<NewAccount>]
  cancel: []
}>()

const { t } = useI18n()
const name = ref(props.account?.name ?? '')
const color = ref(props.account?.color ?? '#2563eb')
const token = ref('')
const notificationsEnabled = ref(props.account?.notificationsEnabled ?? true)
const error = ref<string | null>(null)
const testState = ref<'idle' | 'busy' | 'ok' | 'fail'>('idle')
const testMessage = ref('')

function effectiveToken(): string {
  return token.value.trim() || props.account?.token || ''
}

function pct(v: unknown): string {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100).toString() : '?'
}

async function test() {
  const tok = effectiveToken()
  if (!tok.startsWith('sk-ant-oat')) {
    error.value = t('accounts.invalidToken')
    return
  }
  error.value = null
  testState.value = 'busy'
  const result = await fetchUsage(tok)
  if (result.ok) {
    const headers = (result.body as { headers?: Record<string, string> })?.headers ?? {}
    testMessage.value = t('accounts.testOk', {
      fiveHour: pct(headers['anthropic-ratelimit-unified-5h-utilization']),
      sevenDay: pct(headers['anthropic-ratelimit-unified-7d-utilization']),
    })
    testState.value = 'ok'
  } else {
    testMessage.value = t('accounts.testFail', { error: result.error })
    testState.value = 'fail'
  }
}

function submit() {
  const tok = effectiveToken()
  if (!name.value.trim()) return
  if (!tok.startsWith('sk-ant-oat')) {
    error.value = t('accounts.invalidToken')
    return
  }
  emit('save', {
    name: name.value.trim(),
    color: color.value,
    token: tok,
    notificationsEnabled: notificationsEnabled.value,
  })
}
</script>

<template>
  <form class="space-y-3 rounded-lg border bg-white dark:border-slate-700 dark:bg-slate-900 p-4" @submit.prevent="submit">
    <label class="block text-sm">
      {{ t('accounts.name') }}
      <input v-model="name" required class="mt-1 w-full rounded border px-2 py-1 dark:border-slate-700 dark:bg-slate-800" />
    </label>
    <label class="block text-sm">
      {{ t('accounts.color') }}
      <input v-model="color" type="color" class="mt-1 h-8 w-16 rounded border" />
    </label>
    <label class="block text-sm">
      {{ t('accounts.token') }}
      <input
        v-model="token"
        type="password"
        autocomplete="off"
        spellcheck="false"
        class="mt-1 w-full rounded border px-2 py-1 font-mono dark:border-slate-700 dark:bg-slate-800"
      />
      <span v-if="account" class="text-xs text-slate-500">{{ t('accounts.tokenKeep') }}</span>
    </label>
    <label class="flex items-center gap-2 text-sm">
      <input v-model="notificationsEnabled" type="checkbox" />
      {{ t('accounts.notifications') }}
    </label>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <p v-if="testState === 'ok'" class="text-sm text-green-600">{{ testMessage }}</p>
    <p v-if="testState === 'fail'" class="text-sm text-red-600">{{ testMessage }}</p>
    <div class="flex gap-2">
      <button type="submit" class="rounded bg-slate-800 px-3 py-1 text-white dark:bg-slate-200 dark:text-slate-900">{{ t('accounts.save') }}</button>
      <button type="button" class="rounded border px-3 py-1 dark:border-slate-600" :disabled="testState === 'busy'" @click="test">
        {{ testState === 'busy' ? t('accounts.testing') : t('accounts.test') }}
      </button>
      <button type="button" class="rounded px-3 py-1 text-slate-500" @click="emit('cancel')">
        {{ t('accounts.cancel') }}
      </button>
    </div>
  </form>
</template>
