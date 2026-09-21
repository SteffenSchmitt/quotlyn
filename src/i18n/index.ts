import { createI18n } from 'vue-i18n'
import de from './de.json'
import en from './en.json'

export type Locale = 'de' | 'en'

function detectLocale(): Locale {
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { de, en },
  datetimeFormats: {
    de: { time: { hour: '2-digit', minute: '2-digit', second: '2-digit' } },
    en: { time: { hour: '2-digit', minute: '2-digit', second: '2-digit' } },
  },
})
