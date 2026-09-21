<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { isIdentifying, isKnownHeader, maskValue } from '../lib/usageView'

const props = defineProps<{ raw: Record<string, string> }>()
const { t } = useI18n()
const open = ref(false)
const mask = ref(true)

const rows = computed(() =>
  Object.keys(props.raw)
    .sort()
    .map((name) => ({
      name,
      value: mask.value && isIdentifying(name) ? maskValue(props.raw[name]!) : props.raw[name]!,
      identifying: isIdentifying(name),
      unknown: !isKnownHeader(name),
    })),
)
</script>

<template>
  <div class="mt-3 border-t pt-2 text-xs dark:border-slate-700">
    <div class="flex items-center justify-between">
      <button class="text-slate-500 hover:underline" @click="open = !open">
        {{ open ? '▾' : '▸' }} {{ t('dashboard.raw.toggle') }}
      </button>
      <label v-if="open" class="flex items-center gap-1 text-slate-500">
        <input v-model="mask" type="checkbox" />
        {{ t('dashboard.raw.mask') }}
      </label>
    </div>
    <table v-if="open" class="mt-2 w-full font-mono">
      <tbody>
        <tr v-for="r in rows" :key="r.name" :class="r.unknown ? 'bg-amber-50 dark:bg-amber-950' : ''">
          <td class="pr-2 align-top text-slate-500">
            {{ r.name }}
            <span v-if="r.unknown" class="ml-1 rounded bg-amber-200 px-1 text-[10px] uppercase text-amber-900">
              {{ t('dashboard.raw.new') }}
            </span>
          </td>
          <td class="break-all" :class="r.identifying ? 'text-slate-400' : ''">{{ r.value }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
