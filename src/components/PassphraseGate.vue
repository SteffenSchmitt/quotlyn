<script setup lang="ts">
import InfoTip from './InfoTip.vue'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAccountsStore } from '../stores/accounts'
import { VaultError } from '../crypto/vault'

const { t } = useI18n()
const store = useAccountsStore()

const passphrase = ref('')
const confirm = ref('')
const remember = ref(false)
const error = ref<string | null>(null)
const busy = ref(false)
const ready = ref(false)

onMounted(async () => {
  await store.init()
  ready.value = true
})

async function submit() {
  error.value = null
  if (store.status === 'no_vault') {
    if (passphrase.value.length < 8) {
      error.value = t('vault.tooShort')
      return
    }
    if (passphrase.value !== confirm.value) {
      error.value = t('vault.mismatch')
      return
    }
  }
  busy.value = true
  try {
    if (store.status === 'no_vault') await store.createVault(passphrase.value)
    else await store.unlock(passphrase.value)
    if (remember.value) await store.setRememberSession(true)
    passphrase.value = ''
    confirm.value = ''
  } catch (e) {
    error.value = e instanceof VaultError && e.code === 'wrong_passphrase' ? t('vault.wrong') : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <slot v-if="store.status === 'unlocked'" />
  <div v-else-if="ready" class="mx-auto mt-16 max-w-sm rounded-lg border bg-white dark:border-slate-700 dark:bg-slate-900 p-6 shadow-sm">
    <h2 class="text-lg font-semibold">
      {{ store.status === 'no_vault' ? t('vault.createTitle') : t('vault.unlockTitle') }}
    </h2>
    <p v-if="store.status === 'no_vault'" class="mt-1 text-sm text-slate-500">{{ t('vault.createHint') }}</p>
    <form class="mt-4 space-y-3" @submit.prevent="submit">
      <label class="block text-sm">
        {{ t('vault.passphrase') }}
        <input
          v-model="passphrase"
          type="password"
          autocomplete="current-password"
          class="mt-1 w-full rounded border px-2 py-1 dark:border-slate-700 dark:bg-slate-800"
          autofocus
        />
      </label>
      <label v-if="store.status === 'no_vault'" class="block text-sm">
        {{ t('vault.confirm') }}
        <input v-model="confirm" type="password" autocomplete="new-password" class="mt-1 w-full rounded border px-2 py-1 dark:border-slate-700 dark:bg-slate-800" />
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="remember" type="checkbox" />
        {{ t('vault.remember') }}
        <InfoTip :text="t('help.remember')" />
      </label>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <button
        type="submit"
        :disabled="busy"
        class="w-full rounded bg-slate-800 px-3 py-1.5 text-white dark:bg-slate-200 dark:text-slate-900 disabled:opacity-50"
      >
        {{ busy ? t('vault.working') : store.status === 'no_vault' ? t('vault.create') : t('vault.unlock') }}
      </button>
    </form>
  </div>
</template>
