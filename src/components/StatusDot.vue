<script setup lang="ts">
import { computed } from 'vue'
import type { AccountPollState } from '../scheduler/poller'

/**
 * Traffic-light dot for an account's poll state. Glows in the state's colour and
 * turns into a spinner while a poll is running.
 */
const props = defineProps<{ status: AccountPollState['status'] | undefined }>()

const COLORS: Record<AccountPollState['status'], string> = {
  idle: '#94a3b8',
  fetching: '#0ea5e9',
  ok: '#10b981',
  paused: '#f59e0b',
  limited: '#ef4444',
  error: '#ef4444',
  disabled: '#ef4444',
}

const status = computed(() => props.status ?? 'idle')
const color = computed(() => COLORS[status.value])
const glow = computed(() => (status.value === 'idle' ? 'none' : `0 0 6px 1px ${color.value}66`))
const pulse = computed(() => status.value === 'limited' || status.value === 'error')
</script>

<template>
  <span class="inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center" aria-hidden="true">
    <span
      v-if="status === 'fetching'"
      class="h-2.5 w-2.5 rounded-full border-2 border-t-transparent motion-safe:animate-spin"
      :style="{ borderColor: color, borderTopColor: 'transparent' }"
    />
    <span
      v-else
      class="h-2.5 w-2.5 rounded-full"
      :class="pulse ? 'motion-safe:animate-pulse' : ''"
      :style="{ backgroundColor: color, boxShadow: glow }"
    />
  </span>
</template>
