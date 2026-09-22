<script setup lang="ts">
import InfoTip from './InfoTip.vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchUsage } from '../api/usageClient'
import type { Account, NewAccount } from '../stores/accounts'
import { PRIMARY_WINDOWS, type PrimaryWindow } from '../lib/usageView'
import { BILLING_VISIBILITIES, type BillingVisibility } from '../lib/accountMeta'

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
const primaryWindow = ref<PrimaryWindow>(props.account?.primaryWindow ?? 'critical')
const billingAccount = ref(props.account?.billingAccount ?? '')
const billingVisibility = ref<BillingVisibility>(props.account?.billingVisibility ?? 'everywhere')
const usedBy = ref(props.account?.usedBy ?? '')
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
    primaryWindow: primaryWindow.value,
    billingAccount: billingAccount.value.trim(),
    billingVisibility: billingVisibility.value,
    usedBy: usedBy.value.trim(),
  })
}
</script>

<template>
  <form class="space-y-3 rounded-lg border bg-white dark:border-slate-700 dark:bg-slate-900 p-4" @submit.prevent="submit">
    <label class="block text-sm">
      {{ t('accounts.name') }}
      <input v-model="name" required class="field mt-1 w-full" />
    </label>
    <label class="block text-sm">
      <span class="flex items-center">{{ t('accounts.color') }}<InfoTip :text="t('help.color')" /></span>
      <input v-model="color" type="color" class="mt-1 block h-8 w-12 cursor-pointer rounded-md border bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900" />
    </label>
    <label class="block text-sm">
      <span class="flex items-center">{{ t('accounts.token') }}<InfoTip :text="t('help.token')" /></span>
      <input
        v-model="token"
        type="password"
        autocomplete="off"
        spellcheck="false"
        :placeholder="account?.token ? t('accounts.tokenSet') : ''"
        class="field mt-1 w-full font-mono placeholder:font-sans"
      />
      <RouterLink to="/help" class="ml-2 text-xs text-sky-700 underline dark:text-sky-400">{{ t('accounts.howTo') }}</RouterLink>
    </label>
    <label class="block text-sm">
      <span class="flex items-center">{{ t('accounts.primaryWindow') }}<InfoTip :text="t('help.primaryWindow')" /></span>
      <select v-model="primaryWindow" class="select mt-1 w-full">
        <option v-for="w in PRIMARY_WINDOWS" :key="w" :value="w">{{ t(`accounts.primary.${w}`) }}</option>
      </select>
    </label>
    <label class="flex items-center gap-2 text-sm">
      <input v-model="notificationsEnabled" type="checkbox" />
      {{ t('accounts.notifications') }}
      <InfoTip :text="t('help.notificationsAccount')" />
    </label>
    <fieldset class="space-y-3 border-t pt-3 dark:border-slate-700">
      <legend class="pr-2 text-sm font-bold">{{ t('accounts.meta') }}</legend>
      <p class="text-xs text-slate-500">{{ t('accounts.metaHint') }}</p>
      <div class="flex flex-wrap gap-3 sm:flex-nowrap">
        <label class="block min-w-0 flex-1 text-sm">
          <span class="flex items-center">{{ t('accounts.billing') }}<InfoTip :text="t('help.billing')" /></span>
          <input v-model="billingAccount" class="field mt-1 w-full" />
        </label>
        <label class="block min-w-0 flex-1 text-sm sm:max-w-56">
          <span class="flex items-center">{{ t('accounts.billingVisibility') }}<InfoTip :text="t('help.billingVisibility')" /></span>
          <select v-model="billingVisibility" class="select mt-1 w-full">
            <option v-for="v in BILLING_VISIBILITIES" :key="v" :value="v">
              {{ t(`accounts.billingVisibilityOptions.${v}`) }}
            </option>
          </select>
        </label>
      </div>
      <label class="block text-sm">
        <span class="flex items-center">{{ t('accounts.usedBy') }}<InfoTip :text="t('help.usedBy')" /></span>
        <textarea v-model="usedBy" rows="3" class="field-area mt-1 w-full resize-y" />
      </label>
    </fieldset>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <p v-if="testState === 'ok'" class="text-sm text-green-600">{{ testMessage }}</p>
    <p v-if="testState === 'fail'" class="text-sm text-red-600">{{ testMessage }}</p>
    <div class="flex gap-2">
      <button type="submit" class="btn-primary">{{ t('accounts.save') }}</button>
      <button type="button" class="btn-secondary" :disabled="testState === 'busy'" @click="test">
        {{ testState === 'busy' ? t('accounts.testing') : t('accounts.test') }}
      </button>
      <button type="button" class="btn-ghost" @click="emit('cancel')">
        {{ t('accounts.cancel') }}
      </button>
    </div>
  </form>
</template>
