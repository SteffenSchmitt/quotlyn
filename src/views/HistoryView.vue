<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import VChart from "vue-echarts";
import { use } from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import {
  RANGES,
  rangeSince,
  resetMarkersFor,
  resetZones,
  seriesFor,
  windowKeysIn,
  type Range,
} from "../lib/historySeries";
import { useChartTheme } from "../lib/chartTheme";
import { withAlpha } from "../lib/palette";
import type { UsageSnapshot } from "../storage/historyDb";
import { useAccountsStore, type Account } from "../stores/accounts";
import { billingFor } from "../lib/accountMeta";
import { useSettingsStore } from "../stores/settings";
import { useUsageStore } from "../stores/usage";
import { useWindowLabels } from "../lib/windowLabels";

use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

const { t, d } = useI18n();
const { oneLine: windowLabel } = useWindowLabels();
const theme = useChartTheme();
const accounts = useAccountsStore();

/** Billing account for the selector's tooltip; undefined leaves the title attribute off. */
function billingTip(a: Account): string | undefined {
  const value = billingFor(a, "elsewhere");
  return value ? t("dashboard.billingTip", { value }) : undefined;
}
const settings = useSettingsStore();
const usage = useUsageStore();

const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  tick = setInterval(() => {
    now.value = Date.now();
  }, 30_000);
});
onUnmounted(() => {
  if (tick) clearInterval(tick);
});

const range = ref<Range>("24h");
const windowKey = ref("5h");
const selected = ref<Set<string>>(new Set(accounts.accounts.map((a) => a.id)));
const data = ref<Record<string, UsageSnapshot[]>>({});

function toggle(id: string) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

async function load() {
  const db = usage.history();
  if (!db) return;
  const since = rangeSince(range.value, Date.now());
  const next: Record<string, UsageSnapshot[]> = {};
  for (const a of accounts.accounts) {
    if (selected.value.has(a.id)) next[a.id] = await db.list(a.id, since);
  }
  data.value = next;
}

watch(
  [
    range,
    selected,
    () => accounts.accounts.length,
    () => Object.values(usage.lastSnapshot),
  ],
  load,
  {
    immediate: true,
    deep: true,
  },
);

const windowKeys = computed(() => {
  const keys = windowKeysIn(Object.values(data.value).flat());
  if (keys.length && !keys.includes(windowKey.value))
    windowKey.value = keys[0]!;
  return keys;
});

const hasData = computed(() =>
  Object.values(data.value).some((l) => l.length > 0),
);

/** Dashed continuation of an account's line to the forecast exhaustion or the reset. */
function forecastSeries(a: { id: string; name: string; color: string }, snaps: UsageSnapshot[]) {
  const f = usage.forecastFor(a.id, windowKey.value, now.value);
  const last = [...snaps].reverse().find((s) => s.ok && s.parsed);
  const w = last?.parsed?.windows.find((x) => x.key === windowKey.value);
  if (!f || !last || !w) return null;
  const endIso = f.beforeReset ? f.exhaustsAt : f.resetsAt;
  const endValue = Math.round((f.beforeReset ? 1 : f.atReset) * 1000) / 10;
  return {
    name: t("history.forecast", { name: a.name }),
    type: "line",
    showSymbol: false,
    symbol: "none",
    silent: false,
    itemStyle: { color: a.color },
    lineStyle: { color: a.color, width: 2, type: "dashed", opacity: 0.7 },
    emphasis: { focus: "series" },
    data: [
      [last.fetchedAt, Math.round(w.utilization * 1000) / 10],
      [endIso, endValue],
    ],
    endIso,
  };
}

const option = computed(() => {
  const th = theme.value;
  const since = rangeSince(range.value, now.value);
  const nowIso = new Date(now.value).toISOString();
  const selectedAccounts = accounts.accounts.filter((a) =>
    selected.value.has(a.id),
  );
  const forecasts = selectedAccounts
    .map((a) => forecastSeries(a, data.value[a.id] ?? []))
    .filter((f): f is NonNullable<typeof f> => f !== null);
  const axisMax = forecasts.reduce((m, f) => (f.endIso > m ? f.endIso : m), nowIso);
  return {
    backgroundColor: "transparent",
    textStyle: { color: th.text, fontFamily: th.font },
    tooltip: {
      trigger: "axis",
      ...th.tooltip,
      axisPointer: { type: "line", lineStyle: { color: th.axisLine } },
      // Own formatter: ECharts' default header prints the time ISO-like ("2026-09-21 23:01:49"), which
      // reads like UTC. The header is built from the data point's timestamp in the locale's format.
      formatter: (params: Array<{ marker: string; seriesName: string; value: [string, number | null] }>) => {
        const first = params[0];
        if (!first) return "";
        const when = new Date(first.value[0]);
        const head = `${d(when, "datetime")}:${String(when.getSeconds()).padStart(2, "0")}`;
        const rows = params.map(
          (p) => `${p.marker} ${p.seriesName}<span style="float:right;margin-left:16px;font-weight:700">${p.value[1] === null ? "–" : `${p.value[1]} %`}</span>`,
        );
        return [head, ...rows].join("<br/>");
      },
    },
    legend: {
      top: 0,
      data: selectedAccounts.map((a) => a.name),
      textStyle: { color: th.muted },
      icon: "roundRect",
      itemWidth: 14,
      itemHeight: 4,
    },
    grid: { left: 48, right: 24, top: 40, bottom: 70 },
    xAxis: {
      type: "time",
      min: since,
      max: axisMax,
      axisLine: { lineStyle: { color: th.axisLine } },
      axisLabel: { color: th.muted },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { color: th.muted, formatter: "{value} %" },
      splitLine: { lineStyle: { color: th.grid, type: "dashed" } },
    },
    dataZoom: [
      { type: "inside" },
      {
        type: "slider",
        bottom: 10,
        borderColor: th.grid,
        fillerColor: th.zone,
        textStyle: { color: th.muted },
      },
    ],
    series: [...selectedAccounts.map((a, idx) => {
      const snaps = data.value[a.id] ?? [];
      const markers = resetMarkersFor(snaps, windowKey.value);
      return {
        name: a.name,
        type: "line",
        smooth: 0.35,
        showSymbol: true,
        symbolSize: 5,
        connectNulls: false,
        itemStyle: { color: a.color },
        lineStyle: { color: a.color, width: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: withAlpha(a.color, 0.28) },
              { offset: 1, color: withAlpha(a.color, 0) },
            ],
          },
        },
        emphasis: { focus: "series" },
        // Break the line where more than two and a half polling intervals passed without a reading.
        data: seriesFor(snaps, windowKey.value, settings.settings.intervalSeconds * 2500),
        // Reset zones only for the first selected account keep the background calm.
        markArea:
          idx === 0
            ? {
                silent: true,
                itemStyle: { color: th.zone },
                data: resetZones(markers, since, nowIso).map(([from, to]) => [
                  { xAxis: from },
                  { xAxis: to },
                ]),
              }
            : undefined,
        markLine: {
          symbol: ["none", "none"],
          silent: true,
          lineStyle: {
            color: a.color,
            type: "dashed",
            opacity: 0.55,
            width: 1,
          },
          label: {
            show: idx === 0,
            position: "insideEndTop",
            color: th.muted,
            fontSize: 10,
            formatter: (p: { value: string }) => d(new Date(p.value), "time"),
          },
          data: markers.map((iso) => ({ xAxis: iso })),
        },
      };
    }), ...forecasts.map(({ endIso: _end, ...f }) => f)],
  };
});
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <h2 class="text-lg font-bold">{{ t("history.title") }}</h2>
      <div
        class="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 text-sm"
      >
        <label class="flex items-center gap-2">
          {{ t("history.window") }}
          <select v-model="windowKey" class="select">
            <option v-for="k in windowKeys" :key="k" :value="k">
              {{ windowLabel(k) }}
            </option>
          </select>
        </label>
        <div class="flex items-center gap-2">
          {{ t("history.range") }}
          <button
            v-for="r in RANGES"
            :key="r"
            :class="range === r ? 'btn-primary' : 'btn-secondary'"
            @click="range = r"
          >
            {{ t(`history.range${r}`) }}
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          {{ t("history.accounts") }}
          <label
            v-for="a in accounts.accounts"
            :key="a.id"
            class="flex items-center gap-1"
            :title="billingTip(a)"
          >
            <input
              type="checkbox"
              :checked="selected.has(a.id)"
              @change="toggle(a.id)"
            />
            <span
              class="h-2 w-2 rounded-full"
              :style="{ backgroundColor: a.color }"
            />
            {{ a.name }}
          </label>
        </div>
      </div>
    </div>
    <div
      class="rounded-lg border bg-white dark:border-slate-700 dark:bg-slate-900 p-2"
    >
      <VChart
        v-if="hasData"
        :option="option"
        autoresize
        :style="{ height: '420px', width: '100%' }"
      />
      <p v-else class="p-6 text-sm text-slate-500">{{ t("history.empty") }}</p>
    </div>
  </section>
</template>
