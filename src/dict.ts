const LANG_REG = browser.i18n.getUILanguage().replace('-', '_')
export const LANG = LANG_REG.slice(0, 2)

// Set dictionary. Loaded by the dict.* bundles on the global object; absent in
// the service worker (no DOM), so guard via globalThis instead of window.
const dict: Record<string, TranslationFn | string> = {}
const translations = (globalThis as { translations?: Translations }).translations
if (translations) {
  for (const key of Object.keys(translations)) {
    const prop = translations[key]
    dict[key] = prop[LANG_REG] ?? prop[LANG] ?? prop.en
  }
}

function isString(r: string | TranslationFn): r is string {
  if (r.constructor === String) return true
  else return false
}

export function translate(id?: string, ...args: (number | string | undefined)[]): string {
  if (!id) return ''

  const record = dict[id]
  if (record === undefined) return id

  if (isString(record)) return record
  else return record(...args)
}
