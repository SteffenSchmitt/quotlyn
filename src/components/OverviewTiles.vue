<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Account } from '../stores/accounts'
import type { ParsedUsage } from '../api/usageParser'
import { criticalWindow, formatCountdown, levelColor, levelFor, sortByHeadroom } from '../lib/usageView'

const props = defineProps<{
  accounts: Account[]
  latest: Record<string, ParsedUsage | undefined>
  now: number
}>()
const { t } = useI18n()

const tiles = computed(() =>
  sortByHeadroom(props.accounts, (a) => props.latest[a.id]).map((a) => {
    const w = criticalWindow(props.latest[a.id])
    return {
      account: a,
      window: w,
      color: w ? levelColor(levelFor(w.utilization)) : '#94a3b8',
      countdown: w ? formatCountdown(w.resetsAt, props.now) : '–',
    }
  }),
)
</script>

<template>
  <section>
    <h2 class="mb-2 text-sm font-semibold text-slate-500">{{ t('dashboard.overview') }}</h2>
    <div class="flex flex-wrap gap-2">
      <div
        v-for="tile in tiles"
        :key="tile.account.id"
        class="flex min-w-40 items-center gap-3 rounded-lg border bg-white px-3 py-2"
        :style="{ borderLeft: `4px solid ${tile.account.color}` }"
      >
        <div class="flex-1">
          <div class="text-sm font-medium">{{ tile.account.name }}</div>
          <div class="text-xs text-slate-500">
            <template v-if="tile.window">
              {{ tile.window.key }} · {{ t('dashboard.resetsIn', { t: tile.countdown }) }}
            </template>
            <template v-else>{{ t('dashboard.noData') }}</template>
          </div>
        </div>
        <div class="text-lg font-semibold" :style="{ color: tile.color }">
          {{ tile.window ? Math.round(tile.window.utilization * 100) + ' %' : '–' }}
        </div>
      </div>
    </div>
  </section>
</template>
