<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AccountForm from '../components/AccountForm.vue'
import { useAccountsStore, type Account, type NewAccount } from '../stores/accounts'
import { useUsageStore } from '../stores/usage'

const { t } = useI18n()
const store = useAccountsStore()
const usage = useUsageStore()
const adding = ref(false)
const editingId = ref<string | null>(null)
const confirmingId = ref<string | null>(null)

async function onAdd(value: Required<NewAccount>) {
  await store.addAccount(value)
  adding.value = false
}

async function onEdit(id: string, value: Required<NewAccount>) {
  await store.updateAccount(id, value)
  usage.resetAccount(id)
  editingId.value = null
}

async function onDelete(account: Account) {
  await usage.removeAccountData(account.id)
  await store.removeAccount(account.id)
  confirmingId.value = null
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-bold">{{ t('accounts.title') }}</h2>
      <button v-if="!adding" class="btn-primary" @click="adding = true">
        {{ t('accounts.add') }}
      </button>
    </div>

    <AccountForm v-if="adding" @save="onAdd" @cancel="adding = false" />

    <p v-if="store.accounts.length === 0 && !adding" class="text-slate-500">{{ t('accounts.empty') }}</p>

    <ul class="space-y-2">
      <li v-for="(account, index) in store.accounts" :key="account.id" class="rounded-lg border bg-white dark:border-slate-700 dark:bg-slate-900 p-3">
        <AccountForm
          v-if="editingId === account.id"
          :account="account"
          @save="(v) => onEdit(account.id, v)"
          @cancel="editingId = null"
        />
        <div v-else-if="confirmingId === account.id" class="flex items-center gap-3">
          <span class="flex-1 text-sm">{{ t('accounts.confirmDelete', { name: account.name }) }}</span>
          <button class="btn-danger-solid" @click="onDelete(account)">
            {{ t('accounts.yes') }}
          </button>
          <button class="btn-secondary" @click="confirmingId = null">{{ t('accounts.no') }}</button>
        </div>
        <div v-else class="flex items-center gap-2 text-sm">
          <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: account.color }" />
          <button type="button" class="min-w-0 flex-1 truncate text-left font-bold hover:underline" :title="t('accounts.edit')" @click="editingId = account.id">
            {{ account.name }}
          </button>
          <span class="mr-1 font-mono text-xs text-slate-400">{{ account.token.slice(0, 14) }}…</span>
          <button
            class="btn-icon"
            :disabled="index === 0"
            :title="t('accounts.up')"
            @click="store.moveAccount(account.id, -1)"
          >
            ↑
          </button>
          <button
            class="btn-icon"
            :disabled="index === store.accounts.length - 1"
            :title="t('accounts.down')"
            @click="store.moveAccount(account.id, 1)"
          >
            ↓
          </button>
          <button class="btn-secondary" @click="editingId = account.id">
            {{ t('accounts.edit') }}
          </button>
          <button class="btn-danger" @click="confirmingId = account.id">
            {{ t('accounts.delete') }}
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
