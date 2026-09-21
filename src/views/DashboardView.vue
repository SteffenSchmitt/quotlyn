<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import AccountCard from "../components/AccountCard.vue";
import { sortByHeadroom } from "../lib/usageView";
import { recommend } from "../lib/recommend";
import { forecastLine } from "../lib/forecastText";
import { useWindowLabels } from "../lib/windowLabels";
import { useAccountsStore } from "../stores/accounts";
import { useSettingsStore } from "../stores/settings";
import { useUsageStore } from "../stores/usage";

const { t } = useI18n();
const { oneLine } = useWindowLabels();
const accounts = useAccountsStore();
const settings = useSettingsStore();
const usage = useUsageStore();

const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  tick = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  if (tick) clearInterval(tick);
});

const orderedAccounts = computed(() =>
  settings.settings.dashboardSort === "headroom"
    ? sortByHeadroom(accounts.accounts, (a) => usage.latest[a.id])
    : accounts.accounts,
);

const INTERVAL_PRESETS = [60, 120, 300, 600, 900, 1800];
const intervalOptions = computed(() => {
  const current = settings.settings.intervalSeconds;
  return INTERVAL_PRESETS.includes(current)
    ? INTERVAL_PRESETS
    : [...INTERVAL_PRESETS, current].sort((a, b) => a - b);
});
const autoRefreshValue = computed(() =>
  settings.settings.autoRefresh
    ? String(settings.settings.intervalSeconds)
    : "off",
);
function onAutoRefresh(value: string) {
  if (value === "off") settings.update({ autoRefresh: false });
  else settings.update({ autoRefresh: true, intervalSeconds: Number(value) });
}
function forecastsFor(accountId: string): Record<string, import("../lib/forecast").Forecast | null> {
  const windows = usage.latest[accountId]?.windows ?? [];
  return Object.fromEntries(windows.map((w) => [w.key, usage.forecastFor(accountId, w.key, now.value)]));
}
/** Which account to use next, for the session and for the week, from live values and forecasts. */
const recommendation = computed(() => {
  const forecasts = Object.fromEntries(accounts.accounts.map((a) => [a.id, forecastsFor(a.id)]));
  const status = Object.fromEntries(accounts.accounts.map((a) => [a.id, usage.pollState[a.id]?.status]));
  return recommend(accounts.accounts, usage.latest, forecasts, status);
});
function pickName(pick: { accountId: string } | null): string {
  if (!pick) return t("dashboard.recommend.none");
  return accounts.accounts.find((a) => a.id === pick.accountId)?.name ?? "?";
}
function pickText(pick: { accountId: string; windowKey: string; utilization: number; forecast: import("../lib/forecast").Forecast | null } | null): string {
  if (!pick) return t("dashboard.recommend.none");
  const name = accounts.accounts.find((a) => a.id === pick.accountId)?.name ?? "?";
  const base = `${name} · ${oneLine(pick.windowKey)} ${Math.round(pick.utilization * 100)} %`;
  return pick.forecast ? `${base} · ${forecastLine(pick.forecast, now.value, (k, p) => t(k, p ?? {}))}` : base;
}
const RECOMMEND_OPEN_KEY = "quotlyn.recommend.open";
function readOpen(): boolean {
  try {
    return localStorage.getItem(RECOMMEND_OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}
const recommendOpen = ref(readOpen());
function toggleRecommend() {
  recommendOpen.value = !recommendOpen.value;
  try {
    localStorage.setItem(RECOMMEND_OPEN_KEY, recommendOpen.value ? "1" : "0");
  } catch {
    // storage may be unavailable; the strip just does not remember
  }
}
function intervalLabel(seconds: number): string {
  return seconds % 60 === 0
    ? t("dashboard.autoRefreshEveryMin", { n: seconds / 60 })
    : t("dashboard.autoRefreshEverySec", { n: seconds });
}
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 class="text-lg font-bold">{{ t("nav.dashboard") }}</h2>
      <div class="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <select
          :value="autoRefreshValue"
          class="select"
          :aria-label="t('dashboard.autoRefresh')"
          @change="onAutoRefresh(($event.target as HTMLSelectElement).value)"
        >
          <option value="off">{{ t("dashboard.autoRefreshOff") }}</option>
          <option v-for="s in intervalOptions" :key="s" :value="String(s)">
            {{ intervalLabel(s) }}
          </option>
        </select>
        <select
          :value="settings.settings.dashboardSort"
          class="select"
          :aria-label="t('dashboard.sort.label')"
          @change="
            settings.update({
              dashboardSort: ($event.target as HTMLSelectElement).value as
                'manual' | 'headroom',
            })
          "
        >
          <option value="manual">
            {{ t("dashboard.sort.label") }}: {{ t("dashboard.sort.manual") }}
          </option>
          <option value="headroom">
            {{ t("dashboard.sort.label") }}:
            {{ t("dashboard.sort.headroom") }}
          </option>
        </select>
        <button
          class="btn-primary"
          :disabled="usage.refreshing || accounts.accounts.length === 0"
          @click="usage.refreshNow()"
        >
          {{
            usage.refreshing
              ? t("dashboard.refreshing")
              : t("dashboard.refresh")
          }}
        </button>
      </div>
    </div>

    <p v-if="accounts.accounts.length === 0" class="text-slate-500">
      {{ t("dashboard.emptyHelp") }}
      <RouterLink to="/help" class="text-sky-700 underline dark:text-sky-400">{{
        t("nav.help")
      }}</RouterLink>
    </p>

    <section
      v-if="accounts.accounts.length > 1 && (recommendation.now || recommendation.week)"
      class="rounded-lg border bg-white text-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <button
        type="button"
        class="flex w-full items-center gap-2 px-4 py-2 text-left font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        :aria-expanded="recommendOpen"
        @click="toggleRecommend"
      >
        <span class="inline-block w-3 text-xs text-slate-500">{{ recommendOpen ? "▾" : "▸" }}</span>
        {{ t("dashboard.recommend.title") }}
        <span v-if="!recommendOpen" class="ml-2 truncate font-normal text-slate-500">
          <span class="text-amber-400">★</span> {{ pickName(recommendation.now) }} ·
          <span class="text-sky-400">★</span> {{ pickName(recommendation.week) }}
        </span>
      </button>
      <ul v-if="recommendOpen" class="space-y-1.5 px-4 pb-3">
        <li class="flex items-start gap-2">
          <span class="mt-0.5 text-amber-400" aria-hidden="true">★</span>
          <span><span class="font-bold">{{ t("dashboard.recommend.now") }}:</span> {{ pickText(recommendation.now) }}</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="mt-0.5 text-sky-400" aria-hidden="true">★</span>
          <span><span class="font-bold">{{ t("dashboard.recommend.week") }}:</span> {{ pickText(recommendation.week) }}</span>
        </li>
      </ul>
    </section>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <AccountCard
        v-for="a in orderedAccounts"
        :key="a.id"
        :account="a"
        :parsed="usage.latest[a.id]"
        :state="usage.pollState[a.id]"
        :thresholds="settings.settings.thresholds"
        :forecasts="forecastsFor(a.id)"
        :star-now="recommendation.now?.accountId === a.id"
        :star-week="recommendation.week?.accountId === a.id"
        :now="now"
        @refresh="usage.refreshAccount(a.id)"
      />
    </div>
  </section>
</template>
