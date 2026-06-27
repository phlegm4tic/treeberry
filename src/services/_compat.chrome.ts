// Bridges the gaps between the Firefox WebExtensions API this code targets and the
// Chromium API. Imported first in every entry point so the rest of the code can keep
// calling `browser.*` (aliased to `chrome` at build time) unchanged. No-op on Firefox.

const api = (globalThis as any).chrome as any
if (api) {
  patchSessions()
  patchTheme()
  patchMenus()
  patchTabs()
}

// Containers are Firefox-only; Chromium's tabs.create rejects a cookieStoreId,
// which would break every "open tab" path. Drop it before the call.
function patchTabs() {
  const tabs = api.tabs
  if (!tabs || tabs.__sdbrCreate) return

  // Tab succession is Firefox-only; without it Chromium just uses its default
  // next-active-tab behavior. Stub it so the many call sites don't throw.
  if (!tabs.moveInSuccession) tabs.moveInSuccession = () => {}

  // Tab warmup (on hover) is Firefox-only
  if (!tabs.warmup) tabs.warmup = () => Promise.resolve()

  if (!tabs.create) return
  const create = tabs.create.bind(tabs)
  tabs.__sdbrCreate = create
  tabs.create = (props: any, cb?: any) => {
    // Chromium rejects the key even when its value is undefined
    if (props && 'cookieStoreId' in props) {
      props = { ...props }
      delete props.cookieStoreId
    }
    return create(props, cb)
  }
}

// Firefox keeps arbitrary per-tab/per-window values that persist for the session.
// Chromium has no such thing, so back it with storage.session (cleared on browser
// shutdown, which matches Chromium having no extension session restore anyway).
function patchSessions() {
  if (!api.storage?.session) return
  const sessions = (api.sessions ??= {})
  if (sessions.getTabValue) return

  const store = api.storage.session as {
    get(keys: string): Promise<Record<string, unknown>>
    set(items: Record<string, unknown>): Promise<void>
    remove(keys: string): Promise<void>
  }
  const tabKey = (id: number, key: string) => `t:${id}:${key}`
  const winKey = (id: number, key: string) => `w:${id}:${key}`

  const getValue = async (k: string) => (await store.get(k))[k]
  const setValue = (k: string, value: unknown) => store.set({ [k]: value })

  sessions.getTabValue = (id: number, key: string) => getValue(tabKey(id, key))
  sessions.setTabValue = (id: number, key: string, value: unknown) => setValue(tabKey(id, key), value)
  sessions.removeTabValue = (id: number, key: string) => store.remove(tabKey(id, key))
  sessions.getWindowValue = (id: number, key: string) => getValue(winKey(id, key))
  sessions.setWindowValue = (id: number, key: string, value: unknown) => setValue(winKey(id, key), value)
}

// No theme API on Chromium. An empty theme makes the parser bail and the color
// scheme falls back to the system/manual setting.
function patchTheme() {
  if (api.theme) return
  api.theme = { getCurrent: async () => ({}), onUpdated: noopEvent() }
}

// The native context menu (browser.menus) is Firefox-only; Chromium has the
// narrower contextMenus API and no concept of overriding the page menu. The
// in-page context menu is used instead, so absorb the native menu calls.
function patchMenus() {
  if (api.menus) return
  api.menus = {
    create: () => 0,
    update: noop,
    remove: noop,
    removeAll: noop,
    overrideContext: noop,
    onClicked: noopEvent(),
    onShown: noopEvent(),
    onHidden: noopEvent(),
  }
}

function noop() {}
function noopEvent() {
  return { addListener: noop, removeListener: noop, hasListener: () => false }
}
