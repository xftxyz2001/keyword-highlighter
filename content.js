(() => {
  "use strict";

  const MARK_CLASS = "kw-highlighter__mark";
  const MARK_SELECTOR = `mark.${MARK_CLASS}`;
  const SKIPPED_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION",
    "BUTTON", "CODE", "PRE", "SVG", "CANVAS", "VIDEO", "AUDIO", "IFRAME"
  ]);
  const DEFAULT_SETTINGS = {
    enabled: true,
    defaultColor: "#ffff00",
    caseSensitive: false,
    wholeWord: false,
    observeChanges: true,
    excludedSites: [],
    keywords: []
  };

  let settings = { ...DEFAULT_SETTINGS };
  let observer = null;
  let refreshTimer = null;
  let highlightCount = 0;

  function normalizeSettings(value) {
    return {
      ...DEFAULT_SETTINGS,
      ...(value || {}),
      excludedSites: Array.isArray(value?.excludedSites) ? value.excludedSites : [],
      keywords: Array.isArray(value?.keywords) ? value.keywords : []
    };
  }

  function validColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function wildcardToRegExp(pattern) {
    const escaped = pattern.split("*").map(escapeRegExp).join(".*");
    return new RegExp(`^${escaped}$`, "i");
  }

  function isCurrentSiteExcluded() {
    const href = location.href.toLowerCase();
    const hostname = location.hostname.toLowerCase();
    const hostAndPath = `${location.host}${location.pathname}${location.search}${location.hash}`.toLowerCase();

    return settings.excludedSites.some((rawPattern) => {
      const pattern = String(rawPattern || "").trim().toLowerCase();
      if (!pattern) return false;
      if (pattern.includes("://") || pattern.includes("/") || pattern.includes("*")) {
        try {
          const matcher = wildcardToRegExp(pattern);
          return matcher.test(href) || matcher.test(hostname) || matcher.test(hostAndPath);
        } catch {
          return false;
        }
      }
      return hostname === pattern || hostname.endsWith(`.${pattern}`);
    });
  }

  function getEnabledKeywords() {
    const unique = new Map();
    const defaultColor = validColor(settings.defaultColor, "#ffff00");

    for (const entry of settings.keywords) {
      const text = typeof entry === "string" ? entry.trim() : String(entry?.text || "").trim();
      const enabled = typeof entry === "string" ? true : entry?.enabled !== false;
      if (!text || !enabled) continue;

      const key = settings.caseSensitive ? text : text.toLocaleLowerCase();
      if (!unique.has(key)) {
        unique.set(key, {
          text,
          color: validColor(entry?.color, defaultColor)
        });
      }
    }

    return [...unique.values()].sort((a, b) => b.text.length - a.text.length);
  }

  function createMatcher(entries) {
    if (!entries.length) return null;
    const alternatives = entries.map((entry) => escapeRegExp(entry.text)).join("|");
    const source = settings.wholeWord
      ? `(?<![\\p{L}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{N}_])`
      : `(?:${alternatives})`;
    return new RegExp(source, settings.caseSensitive ? "gu" : "giu");
  }

  function shouldSkipNode(node) {
    const parent = node.parentElement;
    if (!parent || !node.nodeValue?.trim()) return true;
    if (SKIPPED_TAGS.has(parent.tagName)) return true;
    if (parent.closest(MARK_SELECTOR)) return true;
    if (parent.isContentEditable || parent.closest("[contenteditable='true']")) return true;
    if (parent.closest("[aria-hidden='true']")) return true;
    return false;
  }

  function collectTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return shouldSkipNode(node)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function highlightTextNode(node, matcher, entryMap) {
    const text = node.nodeValue;
    matcher.lastIndex = 0;
    let match = matcher.exec(text);
    if (!match) return 0;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let count = 0;

    while (match) {
      if (match.index > cursor) fragment.append(text.slice(cursor, match.index));

      const matchedText = match[0];
      const lookupKey = settings.caseSensitive ? matchedText : matchedText.toLocaleLowerCase();
      const entry = entryMap.get(lookupKey);
      const mark = document.createElement("mark");
      mark.className = MARK_CLASS;
      mark.dataset.keyword = entry?.text || matchedText;
      mark.style.setProperty("--kw-highlight-color", entry?.color || settings.defaultColor);
      mark.textContent = matchedText;
      fragment.append(mark);

      cursor = match.index + matchedText.length;
      count += 1;
      match = matcher.exec(text);
    }

    if (cursor < text.length) fragment.append(text.slice(cursor));
    node.replaceWith(fragment);
    return count;
  }

  function clearHighlights() {
    const affectedParents = new Set();
    for (const mark of document.querySelectorAll(MARK_SELECTOR)) {
      const parent = mark.parentNode;
      affectedParents.add(parent);
      mark.replaceWith(document.createTextNode(mark.textContent || ""));
    }
    for (const parent of affectedParents) parent?.normalize();
  }

  function reportCount() {
    chrome.runtime.sendMessage({ type: "HIGHLIGHT_COUNT", count: highlightCount }).catch(() => {});
  }

  function configureObserver() {
    observer?.disconnect();
    observer = null;

    if (!settings.observeChanges || !settings.enabled || isCurrentSiteExcluded() || !document.body) return;
    observer = new MutationObserver((mutations) => {
      const hasRelevantChange = mutations.some((mutation) => {
        if (mutation.type === "characterData") return !mutation.target.parentElement?.closest(MARK_SELECTOR);
        return [...mutation.addedNodes].some((node) => {
          if (node.nodeType === Node.TEXT_NODE) return Boolean(node.nodeValue?.trim());
          return node.nodeType === Node.ELEMENT_NODE && !node.matches?.(MARK_SELECTOR);
        });
      });
      if (hasRelevantChange) scheduleRefresh();
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  }

  function applyHighlights() {
    if (!document.body) return;
    observer?.disconnect();
    clearHighlights();
    highlightCount = 0;

    if (settings.enabled && !isCurrentSiteExcluded()) {
      const entries = getEnabledKeywords();
      const matcher = createMatcher(entries);
      if (matcher) {
        const entryMap = new Map(entries.map((entry) => [
          settings.caseSensitive ? entry.text : entry.text.toLocaleLowerCase(),
          entry
        ]));
        for (const node of collectTextNodes(document.body)) {
          highlightCount += highlightTextNode(node, matcher, entryMap);
        }
      }
    }

    reportCount();
    configureObserver();
  }

  function scheduleRefresh(delay = 120) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(applyHighlights, delay);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_HIGHLIGHT_STATS") {
      sendResponse({ count: highlightCount, excluded: isCurrentSiteExcluded() });
      return;
    }
    if (message?.type === "REFRESH_HIGHLIGHTS") {
      scheduleRefresh(0);
      sendResponse({ ok: true });
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.settings) return;
    settings = normalizeSettings(changes.settings.newValue);
    scheduleRefresh(0);
  });

  chrome.storage.local.get("settings").then(({ settings: storedSettings }) => {
    settings = normalizeSettings(storedSettings);
    applyHighlights();
  });
})();
