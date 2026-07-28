const DEFAULT_SETTINGS = {
  enabled: true,
  defaultColor: "#ffff00",
  caseSensitive: false,
  wholeWord: false,
  observeChanges: true,
  excludedSites: [],
  siteLibraries: [],
  keywords: []
};

async function loadDefaultKeywords() {
  try {
    const response = await fetch(chrome.runtime.getURL("default-keywords.json"));
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.keywords) ? data.keywords : [];
  } catch {
    return [];
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get("settings");
  const initialKeywords = settings
    ? (Array.isArray(settings.keywords) ? settings.keywords : [])
    : await loadDefaultKeywords();
  await chrome.storage.local.set({
    settings: {
      ...DEFAULT_SETTINGS,
      ...(settings || {}),
      siteLibraries: Array.isArray(settings?.siteLibraries) ? settings.siteLibraries : [],
      keywords: initialKeywords
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
