const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const referencedFiles = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_ui.page,
  ...manifest.content_scripts.flatMap((item) => [...item.js, ...item.css])
];

for (const relativePath of referencedFiles) {
  assert.ok(fs.existsSync(path.join(root, relativePath)), `清单引用的文件不存在：${relativePath}`);
}
assert.equal(manifest.manifest_version, 3);
assert.ok(manifest.permissions.includes("storage"));
assert.ok(manifest.permissions.includes("activeTab"));

const defaultLibrary = JSON.parse(fs.readFileSync(path.join(root, "default-keywords.json"), "utf8"));
assert.equal(defaultLibrary.format, "keyword-highlighter-default-library");
assert.equal(defaultLibrary.keywords.length, 42);
assert.equal(new Set(defaultLibrary.keywords.map((entry) => entry.id)).size, 42);
assert.equal(new Set(defaultLibrary.keywords.map((entry) => entry.text.toLocaleLowerCase())).size, 42);
for (const entry of defaultLibrary.keywords) {
  assert.ok(entry.text.trim(), "默认关键词不能为空");
  assert.match(entry.color, /^#[0-9a-f]{6}$/i, `默认关键词颜色无效：${entry.text}`);
}

let source = fs.readFileSync(path.join(root, "content.js"), "utf8");
source = source.replace(
  /\}\)\(\);\s*$/,
  `globalThis.__highlighterTest = {
    escapeRegExp,
    wildcardToRegExp,
    createMatcher,
    getEnabledKeywords,
    isCurrentSiteExcluded,
    setSettings(value) { settings = normalizeSettings(value); }
  };})();`
);

const context = {
  URL,
  console,
  clearTimeout,
  setTimeout,
  location: new URL("https://docs.example.com/guide/start?q=1"),
  document: { body: null },
  NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
  chrome: {
    runtime: {
      onMessage: { addListener() {} },
      sendMessage() { return Promise.resolve(); }
    },
    storage: {
      onChanged: { addListener() {} },
      local: { get() { return Promise.resolve({}); } }
    }
  }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "content.js" });

const api = context.__highlighterTest;
assert.ok(api, "未能加载内容脚本测试接口");

api.setSettings({
  caseSensitive: false,
  wholeWord: false,
  defaultColor: "#ffff00",
  keywords: [
    { text: "OpenAI", color: "#ffff00", enabled: true },
    { text: "C++", color: "#ff0000", enabled: true },
    { text: "open", color: "#00ff00", enabled: true }
  ]
});
let entries = api.getEnabledKeywords();
assert.deepEqual(Array.from(entries, (entry) => entry.text), ["OpenAI", "open", "C++"]);
let matcher = api.createMatcher(entries);
assert.deepEqual(Array.from("OpenAI openai C++".match(matcher)), ["OpenAI", "openai", "C++"]);

api.setSettings({
  caseSensitive: true,
  wholeWord: false,
  keywords: [{ text: "OpenAI", enabled: true }]
});
matcher = api.createMatcher(api.getEnabledKeywords());
assert.deepEqual(Array.from("OpenAI openai".match(matcher)), ["OpenAI"]);

api.setSettings({
  caseSensitive: false,
  wholeWord: true,
  keywords: [{ text: "cat", enabled: true }]
});
matcher = api.createMatcher(api.getEnabledKeywords());
assert.deepEqual(Array.from("cat concatenate cat_ cat.".match(matcher)), ["cat", "cat"]);

api.setSettings({ excludedSites: ["*.example.com/guide/*"] });
assert.equal(api.isCurrentSiteExcluded(), true);
api.setSettings({ excludedSites: ["example.org"] });
assert.equal(api.isCurrentSiteExcluded(), false);

assert.equal(api.escapeRegExp("a.b+c?"), "a\\.b\\+c\\?");
console.log("All keyword highlighter tests passed.");
