const DEFAULT_SETTINGS = {
  enabled: true,
  defaultColor: "#ffff00",
  caseSensitive: false,
  wholeWord: false,
  observeChanges: true,
  excludedSites: [],
  keywords: []
};

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get("settings");
  await chrome.storage.local.set({
    settings: {
      ...DEFAULT_SETTINGS,
      ...(settings || {}),
      keywords: Array.isArray(settings?.keywords) ? settings.keywords : []
    }
  });

  await chrome.action.setBadgeBackgroundColor({ color: "#4f46e5" });
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "HIGHLIGHT_COUNT" || !sender.tab?.id) return;

  const count = Number(message.count) || 0;
  chrome.action.setBadgeText({
    tabId: sender.tab.id,
    text: count > 0 ? (count > 999 ? "999+" : String(count)) : ""
  });
});
