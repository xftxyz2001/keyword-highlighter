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

const $ = (selector) => document.querySelector(selector);
const elements = {
  saveStatus: $("#saveStatus"),
  totalCount: $("#totalCount"),
  enabledToggle: $("#enabledToggle"),
  bulkInput: $("#bulkInput"),
  newKeywordColor: $("#newKeywordColor"),
  newColorCode: $("#newColorCode"),
  addKeywords: $("#addKeywords"),
  exportJsonTop: $("#exportJsonTop"),
  librarySelect: $("#librarySelect"),
  libraryScope: $("#libraryScope"),
  newSiteLibrary: $("#newSiteLibrary"),
  deleteSiteLibrary: $("#deleteSiteLibrary"),
  siteLibraryConfig: $("#siteLibraryConfig"),
  siteLibraryName: $("#siteLibraryName"),
  siteLibraryPatterns: $("#siteLibraryPatterns"),
  siteLibraryEnabled: $("#siteLibraryEnabled"),
  searchInput: $("#searchInput"),
  visibleCount: $("#visibleCount"),
  enableAll: $("#enableAll"),
  disableAll: $("#disableAll"),
  keywordList: $("#keywordList"),
  emptyState: $("#emptyState"),
  defaultColor: $("#defaultColor"),
  defaultColorCode: $("#defaultColorCode"),
  caseSensitive: $("#caseSensitive"),
  wholeWord: $("#wholeWord"),
  observeChanges: $("#observeChanges"),
  excludedSites: $("#excludedSites"),
  addDefaults: $("#addDefaults"),
  importButton: $("#importButton"),
  exportJson: $("#exportJson"),
  exportTxt: $("#exportTxt"),
  fileInput: $("#fileInput"),
  clearAll: $("#clearAll"),
  toast: $("#toast")
};

let settings = { ...DEFAULT_SETTINGS };
let activeLibraryId = "global";
let saveStatusTimer = null;
let toastTimer = null;
let excludedSitesTimer = null;
let siteLibraryTimer = null;

function normalizeSettings(value) {
  const normalized = {
    ...DEFAULT_SETTINGS,
    ...(value || {}),
    excludedSites: Array.isArray(value?.excludedSites) ? value.excludedSites : [],
    siteLibraries: Array.isArray(value?.siteLibraries) ? value.siteLibraries : [],
    keywords: Array.isArray(value?.keywords) ? value.keywords : []
  };
  normalized.defaultColor = validColor(normalized.defaultColor, "#ffff00");
  normalized.keywords = normalized.keywords
    .map((entry) => normalizeEntry(entry, normalized.defaultColor))
    .filter(Boolean);
  normalized.siteLibraries = normalized.siteLibraries
    .map((library, index) => normalizeSiteLibrary(library, index, normalized.defaultColor))
    .filter(Boolean);
  return normalized;
}

function normalizeSiteLibrary(library, index, fallbackColor) {
  if (!library || typeof library !== "object") return null;
  const name = String(library.name || `网站词库 ${index + 1}`).trim();
  return {
    id: library.id ? String(library.id) : createId(),
    name: name || `网站词库 ${index + 1}`,
    enabled: library.enabled !== false,
    patterns: Array.isArray(library.patterns)
      ? library.patterns.map((value) => String(value).trim()).filter(Boolean)
      : [],
    keywords: (Array.isArray(library.keywords) ? library.keywords : [])
      .map((entry) => normalizeEntry(entry, fallbackColor))
      .filter(Boolean)
  };
}

function normalizeEntry(entry, fallbackColor = settings.defaultColor || "#ffff00") {
  const text = typeof entry === "string" ? entry.trim() : String(entry?.text || "").trim();
  if (!text) return null;
  return {
    id: typeof entry === "object" && entry.id ? String(entry.id) : createId(),
    text,
    color: validColor(typeof entry === "object" ? entry.color : "", fallbackColor),
    enabled: typeof entry === "object" ? entry.enabled !== false : true
  };
}

function validColor(value, fallback = "#ffff00") {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value.toLowerCase() : fallback;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getActiveLibrary() {
  return activeLibraryId === "global"
    ? null
    : settings.siteLibraries.find((library) => library.id === activeLibraryId) || null;
}

function getActiveKeywords() {
  return getActiveLibrary()?.keywords || settings.keywords;
}

function setActiveKeywords(keywords) {
  const library = getActiveLibrary();
  if (library) library.keywords = keywords;
  else settings.keywords = keywords;
}

function getTotalKeywordCount() {
  return settings.keywords.length
    + settings.siteLibraries.reduce((total, library) => total + library.keywords.length, 0);
}

function getActiveLibraryName() {
  return getActiveLibrary()?.name || "全局词库";
}

async function saveSettings() {
  await chrome.storage.local.set({ settings });
  elements.saveStatus.classList.add("visible");
  clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => elements.saveStatus.classList.remove("visible"), 1400);
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2600);
}

function isDuplicate(text, ignoreId = "") {
  const candidate = settings.caseSensitive ? text : text.toLocaleLowerCase();
  return getActiveKeywords().some((entry) => {
    if (entry.id === ignoreId) return false;
    const current = settings.caseSensitive ? entry.text : entry.text.toLocaleLowerCase();
    return current === candidate;
  });
}

function renderAll() {
  elements.totalCount.textContent = String(getTotalKeywordCount());
  elements.enabledToggle.checked = settings.enabled;
  elements.defaultColor.value = settings.defaultColor;
  elements.defaultColorCode.textContent = settings.defaultColor;
  elements.newKeywordColor.value = settings.defaultColor;
  elements.newColorCode.textContent = settings.defaultColor;
  elements.caseSensitive.checked = settings.caseSensitive;
  elements.wholeWord.checked = settings.wholeWord;
  elements.observeChanges.checked = settings.observeChanges;
  elements.excludedSites.value = settings.excludedSites.join("\n");
  renderLibraryControls();
  renderKeywordList();
}

function renderLibraryControls() {
  if (activeLibraryId !== "global" && !getActiveLibrary()) activeLibraryId = "global";

  elements.librarySelect.replaceChildren();
  const globalOption = document.createElement("option");
  globalOption.value = "global";
  globalOption.textContent = `全局词库（${settings.keywords.length}）`;
  elements.librarySelect.append(globalOption);

  for (const library of settings.siteLibraries) {
    const option = document.createElement("option");
    option.value = library.id;
    option.textContent = `${library.name}（${library.keywords.length}）`;
    elements.librarySelect.append(option);
  }
  elements.librarySelect.value = activeLibraryId;

  const library = getActiveLibrary();
  elements.siteLibraryConfig.hidden = !library;
  elements.deleteSiteLibrary.hidden = !library;
  if (!library) {
    elements.libraryScope.textContent = "应用于所有未排除的网站";
    return;
  }

  elements.siteLibraryName.value = library.name;
  elements.siteLibraryPatterns.value = library.patterns.join("\n");
  elements.siteLibraryEnabled.checked = library.enabled;
  elements.libraryScope.textContent = library.enabled
    ? (library.patterns.length ? `匹配 ${library.patterns.length} 条网站规则` : "尚未设置适用网站")
    : "此词库已停用";
}

function renderKeywordList() {
  const query = elements.searchInput.value.trim();
  const comparableQuery = settings.caseSensitive ? query : query.toLocaleLowerCase();
  const entries = getActiveKeywords().filter((entry) => {
    const text = settings.caseSensitive ? entry.text : entry.text.toLocaleLowerCase();
    return !comparableQuery || text.includes(comparableQuery);
  });

  elements.visibleCount.textContent = `显示 ${entries.length} 项`;
  elements.keywordList.replaceChildren();
  elements.emptyState.hidden = entries.length > 0 || Boolean(query);

  if (!entries.length && query) {
    const row = document.createElement("div");
    row.className = "empty-state";
    row.innerHTML = "<h3>没有匹配结果</h3><p>换一个关键词搜索试试。</p>";
    elements.keywordList.append(row);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of entries) fragment.append(createKeywordRow(entry));
  elements.keywordList.append(fragment);
}

function createKeywordRow(entry) {
  const row = document.createElement("div");
  row.className = "keyword-row";
  row.dataset.id = entry.id;

  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.className = "mini-check row-enabled";
  enabled.checked = entry.enabled;
  enabled.setAttribute("aria-label", `启用 ${entry.text}`);

  const text = document.createElement("input");
  text.type = "text";
  text.className = "row-text";
  text.value = entry.text;
  text.maxLength = 120;
  text.setAttribute("aria-label", "关键词");

  const colorWrap = document.createElement("span");
  colorWrap.className = "row-color";
  const color = document.createElement("input");
  color.type = "color";
  color.className = "row-color-input";
  color.value = entry.color;
  color.setAttribute("aria-label", `${entry.text} 的颜色`);
  const colorCode = document.createElement("code");
  colorCode.textContent = entry.color;
  colorWrap.append(color, colorCode);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "delete-button";
  remove.title = "删除";
  remove.setAttribute("aria-label", `删除 ${entry.text}`);
  remove.textContent = "×";

  row.append(enabled, text, colorWrap, remove);
  return row;
}

async function addKeywords() {
  const values = elements.bulkInput.value
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (!values.length) {
    showToast("请先输入至少一个关键词", true);
    elements.bulkInput.focus();
    return;
  }

  let added = 0;
  let skipped = 0;
  const activeKeywords = getActiveKeywords();
  for (const text of values) {
    if (isDuplicate(text)) {
      skipped += 1;
      continue;
    }
    activeKeywords.push({ id: createId(), text, color: elements.newKeywordColor.value, enabled: true });
    added += 1;
  }

  elements.bulkInput.value = "";
  await saveSettings();
  renderAll();
  showToast(skipped ? `已添加 ${added} 个，跳过 ${skipped} 个重复词` : `已添加 ${added} 个关键词`);
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJson() {
  const payload = {
    format: "keyword-highlighter",
    version: 2,
    exportedAt: new Date().toISOString(),
    settings
  };
  downloadFile(`关键词词库-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json");
  showToast("JSON 备份已导出");
}

function exportTxt() {
  const content = getActiveKeywords()
    .map((entry) => `${entry.text}\t${entry.color}\t${entry.enabled ? "1" : "0"}`)
    .join("\n");
  const safeName = getActiveLibraryName().replace(/[\\/:*?"<>|]/g, "-");
  downloadFile(`${safeName}-${new Date().toISOString().slice(0, 10)}.txt`, content, "text/plain;charset=utf-8");
  showToast(`${getActiveLibraryName()}已导出为 TXT`);
}

function parseTextEntries(text) {
  return text.split(/\r?\n/).map((line) => {
    const [keyword, color, enabled] = line.split("\t");
    if (!keyword?.trim()) return null;
    return {
      id: createId(),
      text: keyword.trim(),
      color: validColor(color, settings.defaultColor),
      enabled: enabled?.trim() !== "0"
    };
  }).filter(Boolean);
}

function dedupeEntries(entries, caseSensitive) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = caseSensitive ? entry.text : entry.text.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function importFile(file) {
  if (!file) return;
  try {
    const raw = await file.text();
    let importedSettings = null;
    let importedEntries = [];

    if (file.name.toLowerCase().endsWith(".json") || file.type.includes("json")) {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) importedEntries = data;
      else if (Array.isArray(data?.keywords)) importedEntries = data.keywords;
      else if (data?.settings && Array.isArray(data.settings.keywords)) {
        importedSettings = data.settings;
        importedEntries = data.settings.keywords;
      } else throw new Error("JSON 中未找到 keywords 数组");
    } else {
      importedEntries = parseTextEntries(raw);
    }

    const base = importedSettings ? normalizeSettings(importedSettings) : settings;
    const normalizedEntries = importedEntries
      .map((entry) => normalizeEntry(entry, base.defaultColor))
      .filter(Boolean);
    if (!normalizedEntries.length) throw new Error("文件中没有有效关键词");

    const existingEntries = importedSettings ? [] : getActiveKeywords();
    const mergedEntries = dedupeEntries([...existingEntries, ...normalizedEntries], base.caseSensitive);
    const addedCount = mergedEntries.length - existingEntries.length;
    if (importedSettings) {
      settings = { ...base, keywords: mergedEntries };
      activeLibraryId = "global";
    } else {
      setActiveKeywords(mergedEntries);
    }
    await saveSettings();
    renderAll();
    showToast(importedSettings
      ? `已恢复 ${getTotalKeywordCount()} 个关键词和全部设置`
      : `已向${getActiveLibraryName()}新增 ${addedCount} 个关键词${addedCount < normalizedEntries.length ? "，重复项已跳过" : ""}`);
  } catch (error) {
    showToast(`导入失败：${error.message}`, true);
  } finally {
    elements.fileInput.value = "";
  }
}

async function addDefaultLibrary() {
  try {
    const response = await fetch("default-keywords.json");
    if (!response.ok) throw new Error("无法读取默认词库");
    const data = await response.json();
    const defaults = Array.isArray(data.keywords)
      ? data.keywords.map((entry) => normalizeEntry(entry, settings.defaultColor)).filter(Boolean)
      : [];
    if (!defaults.length) throw new Error("默认词库为空");

    const beforeCount = settings.keywords.length;
    settings.keywords = dedupeEntries(
      [...settings.keywords, ...defaults],
      settings.caseSensitive
    );
    const addedCount = settings.keywords.length - beforeCount;
    await saveSettings();
    renderAll();
    showToast(addedCount
      ? `已向全局词库添加 ${addedCount} 个默认关键词`
      : "默认关键词均已存在于全局词库");
  } catch (error) {
    showToast(`添加失败：${error.message}`, true);
  }
}

elements.addKeywords.addEventListener("click", addKeywords);
elements.bulkInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") addKeywords();
});
elements.searchInput.addEventListener("input", renderKeywordList);

elements.newKeywordColor.addEventListener("input", () => {
  elements.newColorCode.textContent = elements.newKeywordColor.value;
});

elements.enabledToggle.addEventListener("change", async () => {
  settings.enabled = elements.enabledToggle.checked;
  await saveSettings();
});

elements.defaultColor.addEventListener("input", async () => {
  settings.defaultColor = elements.defaultColor.value;
  elements.defaultColorCode.textContent = settings.defaultColor;
  elements.newKeywordColor.value = settings.defaultColor;
  elements.newColorCode.textContent = settings.defaultColor;
  await saveSettings();
});

for (const [element, key] of [
  [elements.caseSensitive, "caseSensitive"],
  [elements.wholeWord, "wholeWord"],
  [elements.observeChanges, "observeChanges"]
]) {
  element.addEventListener("change", async () => {
    settings[key] = element.checked;
    await saveSettings();
  });
}

elements.excludedSites.addEventListener("input", () => {
  clearTimeout(excludedSitesTimer);
  excludedSitesTimer = setTimeout(async () => {
    settings.excludedSites = elements.excludedSites.value
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    await saveSettings();
  }, 350);
});

elements.librarySelect.addEventListener("change", () => {
  activeLibraryId = elements.librarySelect.value;
  elements.searchInput.value = "";
  renderAll();
});

elements.newSiteLibrary.addEventListener("click", async () => {
  const library = {
    id: createId(),
    name: `网站词库 ${settings.siteLibraries.length + 1}`,
    enabled: true,
    patterns: [],
    keywords: []
  };
  settings.siteLibraries.push(library);
  activeLibraryId = library.id;
  elements.searchInput.value = "";
  await saveSettings();
  renderAll();
  elements.siteLibraryName.focus();
  elements.siteLibraryName.select();
  showToast("网站词库已创建，请填写适用网站");
});

elements.deleteSiteLibrary.addEventListener("click", async () => {
  const library = getActiveLibrary();
  if (!library) return;
  if (!confirm(`确定删除“${library.name}”及其中的 ${library.keywords.length} 个关键词吗？`)) return;
  settings.siteLibraries = settings.siteLibraries.filter((item) => item.id !== library.id);
  activeLibraryId = "global";
  await saveSettings();
  renderAll();
  showToast("网站词库已删除");
});

function scheduleSiteLibrarySave() {
  const library = getActiveLibrary();
  if (!library) return;
  library.name = elements.siteLibraryName.value.trim() || library.name;
  library.patterns = elements.siteLibraryPatterns.value
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  elements.libraryScope.textContent = library.patterns.length
    ? `匹配 ${library.patterns.length} 条网站规则`
    : "尚未设置适用网站";
  clearTimeout(siteLibraryTimer);
  siteLibraryTimer = setTimeout(saveSettings, 350);
}

elements.siteLibraryName.addEventListener("input", scheduleSiteLibrarySave);
elements.siteLibraryPatterns.addEventListener("input", scheduleSiteLibrarySave);
elements.siteLibraryName.addEventListener("change", () => {
  const library = getActiveLibrary();
  if (!library) return;
  if (!elements.siteLibraryName.value.trim()) elements.siteLibraryName.value = library.name;
  renderLibraryControls();
});
elements.siteLibraryEnabled.addEventListener("change", async () => {
  const library = getActiveLibrary();
  if (!library) return;
  library.enabled = elements.siteLibraryEnabled.checked;
  await saveSettings();
  renderLibraryControls();
});

elements.keywordList.addEventListener("change", async (event) => {
  const row = event.target.closest(".keyword-row");
  if (!row) return;
  const entry = getActiveKeywords().find((item) => item.id === row.dataset.id);
  if (!entry) return;

  if (event.target.classList.contains("row-enabled")) {
    entry.enabled = event.target.checked;
  } else if (event.target.classList.contains("row-color-input")) {
    entry.color = event.target.value;
    event.target.nextElementSibling.textContent = entry.color;
  } else if (event.target.classList.contains("row-text")) {
    const nextText = event.target.value.trim();
    if (!nextText || isDuplicate(nextText, entry.id)) {
      event.target.value = entry.text;
      showToast(!nextText ? "关键词不能为空" : "该关键词已存在", true);
      return;
    }
    entry.text = nextText;
  }
  await saveSettings();
  renderAll();
});

elements.keywordList.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-button");
  if (!button) return;
  const row = button.closest(".keyword-row");
  setActiveKeywords(getActiveKeywords().filter((entry) => entry.id !== row.dataset.id));
  await saveSettings();
  renderAll();
  showToast("关键词已删除");
});

async function setAllEnabled(enabled) {
  getActiveKeywords().forEach((entry) => { entry.enabled = enabled; });
  await saveSettings();
  renderAll();
  showToast(enabled ? "已启用全部关键词" : "已停用全部关键词");
}

elements.enableAll.addEventListener("click", () => setAllEnabled(true));
elements.disableAll.addEventListener("click", () => setAllEnabled(false));
elements.exportJson.addEventListener("click", exportJson);
elements.exportJsonTop.addEventListener("click", exportJson);
elements.exportTxt.addEventListener("click", exportTxt);
elements.addDefaults.addEventListener("click", addDefaultLibrary);
elements.importButton.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", () => importFile(elements.fileInput.files?.[0]));

elements.clearAll.addEventListener("click", async () => {
  const activeKeywords = getActiveKeywords();
  if (!activeKeywords.length) {
    showToast("词库已经是空的");
    return;
  }
  if (!confirm(`确定删除“${getActiveLibraryName()}”中的全部 ${activeKeywords.length} 个关键词吗？此操作无法撤销。`)) return;
  setActiveKeywords([]);
  await saveSettings();
  renderAll();
  showToast("词库已清空");
});

document.querySelectorAll(".sidebar a").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".sidebar a").forEach((item) => item.classList.toggle("active", item === link));
  });
});

chrome.storage.local.get("settings").then(({ settings: storedSettings }) => {
  settings = normalizeSettings(storedSettings);
  renderAll();
});
