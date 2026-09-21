<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AccountForm from '../components/AccountForm.vue'
import { useAccountsStore, type Account, type NewAccount } from '../stores/accounts'

const { t } = useI18n()
const store = useAccountsStore()
const adding = ref(false)
const editingId = ref<string | null>(null)
const confirmingId = ref<string | null>(null)

async function onAdd(value: Required<NewAccount>) {
  await store.addAccount(value)
  adding.value = false
}

async function onEdit(id: string, value: Required<NewAccount>) {
  await store.updateAccount(id, value)
  editingId.value = null
}

async function onDelete(account: Account) {
  await store.removeAccount(account.id)
  confirmingId.value = null
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">{{ t('accounts.title') }}</h2>
      <button v-if="!adding" class="rounded bg-slate-800 px-3 py-1 text-white" @click="adding = true">
        {{ t('accounts.add') }}
      </button>
    </div>

    <AccountForm v-if="adding" @save="onAdd" @cancel="adding = false" />

    <p v-if="store.accounts.length === 0 && !adding" class="text-slate-500">{{ t('accounts.empty') }}</p>

    <ul class="space-y-2">
      <li v-for="(account, index) in store.accounts" :key="account.id" class="rounded-lg border bg-white p-3">
        <AccountForm
          v-if="editingId === account.id"
          :account="account"
          @save="(v) => onEdit(account.id, v)"
          @cancel="editingId = null"
        />
        <div v-else-if="confirmingId === account.id" class="flex items-center gap-3">
          <span class="flex-1 text-sm">{{ t('accounts.confirmDelete', { name: account.name }) }}</span>
          <button class="rounded bg-red-600 px-2 py-0.5 text-sm text-white" @click="onDelete(account)">
            {{ t('accounts.yes') }}
          </button>
          <button class="rounded border px-2 py-0.5 text-sm" @click="confirmingId = null">{{ t('accounts.no') }}</button>
        </div>
        <div v-else class="flex items-center gap-3">
          <span class="h-4 w-4 rounded-full" :style="{ backgroundColor: account.color }" />
          <span class="flex-1 font-medium">{{ account.name }}</span>
          <span class="text-xs text-slate-400">{{ account.token.slice(0, 14) }}…</span>
          <button
            class="rounded border px-2 py-0.5 text-sm disabled:opacity-40"
            :disabled="index === 0"
            :title="t('accounts.up')"
            @click="store.moveAccount(account.id, -1)"
          >
            ↑
          </button>
          <button
            class="rounded border px-2 py-0.5 text-sm disabled:opacity-40"
            :disabled="index === store.accounts.length - 1"
            :title="t('accounts.down')"
            @click="store.moveAccount(account.id, 1)"
          >
            ↓
          </button>
          <button class="rounded border px-2 py-0.5 text-sm" @click="editingId = account.id">
            {{ t('accounts.edit') }}
          </button>
          <button class="rounded border px-2 py-0.5 text-sm text-red-600" @click="confirmingId = account.id">
            {{ t('accounts.delete') }}
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
