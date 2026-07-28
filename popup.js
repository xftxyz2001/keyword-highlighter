const DEFAULT_SETTINGS = {
  enabled: true,
  defaultColor: "#ffff00",
  caseSensitive: false,
  wholeWord: false,
  observeChanges: true,
  excludedSites: [],
  keywords: []
};

const elements = {
  enabledToggle: document.querySelector("#enabledToggle"),
  highlightCount: document.querySelector("#highlightCount"),
  keywordCount: document.querySelector("#keywordCount"),
  pageStatus: document.querySelector("#pageStatus"),
  quickAddForm: document.querySelector("#quickAddForm"),
  keywordInput: document.querySelector("#keywordInput"),
  colorInput: document.querySelector("#colorInput"),
  formMessage: document.querySelector("#formMessage"),
  recentKeywords: document.querySelector("#recentKeywords"),
  siteToggle: document.querySelector("#siteToggle"),
  openOptions: document.querySelector("#openOptions"),
  openOptionsLink: document.querySelector("#openOptionsLink")
};

let settings = { ...DEFAULT_SETTINGS };
let activeTab = null;
let activeHostname = "";
let activeHref = "";

function normalizeSettings(value) {
  return {
    ...DEFAULT_SETTINGS,
    ...(value || {}),
    excludedSites: Array.isArray(value?.excludedSites) ? value.excludedSites : [],
    keywords: Array.isArray(value?.keywords) ? value.keywords : []
  };
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRestrictedUrl(url) {
  return !/^https?:|^file:/i.test(url || "");
}

function wildcardToRegExp(pattern) {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`, "i");
}

function patternMatchesSite(pattern, hostname = activeHostname) {
  const value = String(pattern || "").trim().toLowerCase();
  if (!value) return false;
  if (value.includes("://") || value.includes("/") || value.includes("*")) {
    try {
      const matcher = wildcardToRegExp(value);
      const url = activeHref ? new URL(activeHref) : null;
      const hostAndPath = url ? `${url.host}${url.pathname}${url.search}${url.hash}` : "";
      return matcher.test(activeHref) || matcher.test(hostname) || matcher.test(hostAndPath);
    } catch {
      return false;
    }
  }
  return value === hostname || hostname.endsWith(`.${value}`);
}

function hostIsExcluded(hostname) {
  return settings.excludedSites.some((pattern) => patternMatchesSite(pattern, hostname));
}

async function saveSettings() {
  await chrome.storage.local.set({ settings });
}

function render() {
  elements.enabledToggle.checked = settings.enabled;
  elements.colorInput.value = /^#[\da-f]{6}$/i.test(settings.defaultColor)
    ? settings.defaultColor
    : "#ffff00";

  const enabledKeywords = settings.keywords.filter((entry) => entry?.enabled !== false && String(entry?.text || entry).trim());
  elements.keywordCount.textContent = `${enabledKeywords.length} 个启用词`;
  elements.recentKeywords.replaceChildren();

  for (const entry of enabledKeywords.slice(-6).reverse()) {
    const text = String(entry?.text || entry);
    const chip = document.createElement("span");
    chip.className = "keyword-chip";
    chip.textContent = text;
    chip.title = text;
    chip.style.backgroundColor = entry?.color || settings.defaultColor;
    elements.recentKeywords.append(chip);
  }

  if (!enabledKeywords.length) {
    const empty = document.createElement("span");
    empty.className = "empty-state";
    empty.textContent = "词库还是空的，添加一个试试";
    elements.recentKeywords.append(empty);
  }

  const excluded = activeHostname && hostIsExcluded(activeHostname);
  elements.siteToggle.textContent = excluded ? "移除匹配规则并启用" : "在此网站暂停";
  elements.siteToggle.disabled = !activeHostname;

  if (!settings.enabled) elements.pageStatus.textContent = "高亮已全局暂停";
  else if (excluded) elements.pageStatus.textContent = "此网站已暂停";
}

function showMessage(text, isError = false) {
  elements.formMessage.textContent = text;
  elements.formMessage.classList.toggle("error", isError);
}

async function readActiveTabStats() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;

  try {
    const url = new URL(tab?.url || "");
    activeHref = url.href.toLowerCase();
    activeHostname = ["http:", "https:"].includes(url.protocol) ? url.hostname.toLowerCase() : "";
  } catch {
    activeHref = "";
    activeHostname = "";
  }

  if (!tab?.id || isRestrictedUrl(tab.url)) {
    elements.highlightCount.textContent = "—";
    elements.pageStatus.textContent = "此页面不允许扩展运行";
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_HIGHLIGHT_STATS" });
    elements.highlightCount.textContent = String(response?.count ?? 0);
    elements.pageStatus.textContent = response?.excluded ? "此网站已暂停" : "已连接当前页面";
  } catch {
    elements.highlightCount.textContent = "—";
    elements.pageStatus.textContent = "刷新页面后即可启用";
  }
}

elements.enabledToggle.addEventListener("change", async () => {
  settings.enabled = elements.enabledToggle.checked;
  await saveSettings();
  render();
  setTimeout(readActiveTabStats, 180);
});

elements.quickAddForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = elements.keywordInput.value.trim();
  if (!text) return;

  const comparisonText = settings.caseSensitive ? text : text.toLocaleLowerCase();
  const exists = settings.keywords.some((entry) => {
    const current = String(entry?.text || entry).trim();
    return (settings.caseSensitive ? current : current.toLocaleLowerCase()) === comparisonText;
  });

  if (exists) {
    showMessage("这个关键词已经在词库中", true);
    return;
  }

  settings.keywords.push({
    id: createId(),
    text,
    color: elements.colorInput.value,
    enabled: true
  });
  await saveSettings();
  elements.keywordInput.value = "";
  showMessage(`已添加“${text}”`);
  render();
  setTimeout(readActiveTabStats, 180);
});

elements.siteToggle.addEventListener("click", async () => {
  if (!activeHostname) return;
  const excluded = hostIsExcluded(activeHostname);
  settings.excludedSites = excluded
    ? settings.excludedSites.filter((item) => !patternMatchesSite(item))
    : [...settings.excludedSites, activeHostname];
  await saveSettings();
  render();
  setTimeout(readActiveTabStats, 180);
});

function openOptions() {
  chrome.runtime.openOptionsPage();
}

elements.openOptions.addEventListener("click", openOptions);
elements.openOptionsLink.addEventListener("click", openOptions);

Promise.all([
  chrome.storage.local.get("settings"),
  readActiveTabStats()
]).then(([result]) => {
  settings = normalizeSettings(result.settings);
  render();
  readActiveTabStats();
});
