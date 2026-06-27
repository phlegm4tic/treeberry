// Chromium-only APIs used in chromium builds, where `browser` resolves to `chrome`.

declare namespace browser.sidePanel {
  function setPanelBehavior(behavior: { openPanelOnActionClick?: boolean }): Promise<void>
  function open(options: { windowId?: number; tabId?: number }): Promise<void>
}
