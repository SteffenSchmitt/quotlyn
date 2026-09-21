<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t, tm, rt } = useI18n()

interface Step {
  h: string
  p: string
  code: string
}

// Commands are language-independent and must not pass through the message compiler
// (vue-i18n treats "@" and "{" as syntax).
const CODES = ['npm install -g @anthropic-ai/claude-code\nclaude', '/logout\n/login', 'claude setup-token', '', '']

function steps(): Step[] {
  return (tm('help_page.steps.items') as Array<Record<string, unknown>>).map((s, i) => ({
    h: rt(s.h as never),
    p: rt(s.p as never),
    code: CODES[i] ?? '',
  }))
}
function notes(): string[] {
  return (tm('help_page.notes.items') as unknown[]).map((n) => rt(n as never))
}
const DOCS_URL = 'https://docs.anthropic.com/en/docs/claude-code/overview'
</script>

<template>
  <section class="max-w-2xl space-y-8">
    <div>
      <h2 class="text-lg font-semibold">{{ t('help_page.title') }}</h2>
      <p class="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{{ t('help_page.intro') }}</p>
    </div>

    <div>
      <h3 class="text-sm font-semibold text-slate-500">{{ t('help_page.steps.title') }}</h3>
      <ol class="mt-3 space-y-5">
        <li v-for="(s, i) in steps()" :key="i" class="flex gap-4">
          <span
            class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white dark:bg-slate-200 dark:text-slate-900"
          >
            {{ i + 1 }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ s.h }}</p>
            <p class="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{{ s.p }}</p>
            <pre
              v-if="s.code"
              class="mt-2 overflow-x-auto rounded-md bg-slate-900 px-3 py-2 text-xs text-slate-100 dark:bg-slate-800"
            ><code>{{ s.code }}</code></pre>
          </div>
        </li>
      </ol>
    </div>

    <div>
      <h3 class="text-sm font-semibold text-slate-500">{{ t('help_page.notes.title') }}</h3>
      <ul class="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        <li v-for="(n, i) in notes()" :key="i">{{ n }}</li>
      </ul>
      <p class="mt-3 text-sm">
        <a :href="DOCS_URL" target="_blank" rel="noopener" class="text-sky-700 underline dark:text-sky-400">
          {{ t('help_page.docs') }}
        </a>
      </p>
    </div>
  </section>
</template>
