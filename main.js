"use strict";

const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, session, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");

const EXT = "rfcreport";
const REPO_URL = "https://github.com/michaelmcg/RFC-Report-Generator";
const FORMAT = "rfc-report";

let win = null;
let dirty = false;
let forceClose = false;
let closePrompt = false;
let discardOnClose = false;
let pendingOpenPath = findReportArg(process.argv);

// Window background for each theme. Keep in sync with --bg in src/styles.css.
const BG = { light: "#c0c0c0", dark: "#2b2b2b" };
const THEMES = ["system", "light", "dark"];
// Windows and Linux draw their own Win95 title bar and menu bar in the page (src/chrome.js).
const FRAMELESS = process.platform !== "darwin";

// ---------- settings: theme, ruler, prefill and recent files, kept in userData/settings.json ----------

const settingsPath = () => path.join(app.getPath("userData"), "settings.json");
let settings = { theme: "light", ruler: true, prefill: {}, recent: [] };

// Prefill is the Edit > Settings values for new reports. The page picks which keys it uses
// (Report.PREFILL); main only keeps it to short strings and booleans.
function cleanPrefill(p) {
  const out = {};
  if (!p || typeof p !== "object" || Array.isArray(p)) return out;
  for (const [k, v] of Object.entries(p).slice(0, 64)) {
    if (!/^[a-z_]{1,32}$/.test(k)) continue;
    if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 4000);
  }
  return out;
}

async function loadSettings() {
  try {
    const s = JSON.parse(await fs.readFile(settingsPath(), "utf8"));
    if (THEMES.includes(s.theme)) settings.theme = s.theme;
    if (typeof s.ruler === "boolean") settings.ruler = s.ruler;
    settings.prefill = cleanPrefill(s.prefill);
    if (Array.isArray(s.recent)) {
      settings.recent = s.recent.filter((p) => typeof p === "string" && p.length < 1024).slice(0, 8);
    }
  } catch {
    // Missing or unreadable: keep the defaults.
  }
}

function saveSettings() {
  fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), "utf8").catch(() => {});
}

function currentBg() {
  return nativeTheme.shouldUseDarkColors ? BG.dark : BG.light;
}

function setTheme(theme) {
  settings.theme = theme;
  nativeTheme.themeSource = theme; // flips prefers-color-scheme in the page
  saveSettings();
}

function setRuler(on, fromPage) {
  settings.ruler = on;
  const item = Menu.getApplicationMenu()?.getMenuItemById("ruler");
  if (item) item.checked = on;
  if (!fromPage) send("ruler-set", on);
  saveSettings();
}

// ---------- single instance: reuse the open window for double-clicked files ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const p = findReportArg(argv);
    if (p) openPathInWindow(p);
  });
}

// macOS delivers file opens through this event instead of argv.
app.on("open-file", (e, p) => {
  e.preventDefault();
  if (win) openPathInWindow(p);
  else pendingOpenPath = p;
});

function findReportArg(argv) {
  return argv.slice(1).find((a) => a.toLowerCase().endsWith("." + EXT)) || null;
}

// ---------- window ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 760,
    minHeight: 500,
    backgroundColor: currentBg(),
    icon: path.join(__dirname, "src", "assets", process.platform === "win32" ? "icon.ico" : "icon-32.png"),
    frame: !FRAMELESS,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  win.loadFile(path.join(__dirname, "src", "index.html"));
  win.once("ready-to-show", () => win.show());

  win.webContents.on("did-finish-load", async () => {
    send("ruler-set", settings.ruler);
    sendWinState();
    // Recovery first, so a double-clicked file then asks before replacing the recovered report.
    await offerRecovery();
    if (pendingOpenPath) {
      openPathInWindow(pendingOpenPath);
      pendingOpenPath = null;
    }
  });

  // Links open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.on("context-menu", (_e, params) => showContextMenu(params));

  win.on("close", (e) => {
    if (!dirty || forceClose) return;
    e.preventDefault();
    if (closePrompt) return; // already asking
    closePrompt = true;
    askSave("Save changes before closing?").then((choice) => {
      closePrompt = false;
      if (choice === "save") send("save-then-close");
      else if (choice === "discard") {
        discardOnClose = true;
        forceClose = true;
        if (win) win.close();
      }
    });
  });

  for (const ev of ["maximize", "unmaximize", "enter-full-screen", "leave-full-screen"]) {
    win.on(ev, sendWinState);
  }

  // Delete the recovery copy only once the page is gone, so a late save can't bring it back.
  win.on("closed", () => {
    win = null;
    if (discardOnClose) recoveryOp(() => fs.unlink(recoveryPath()));
  });
}

function sendWinState() {
  if (win) send("win-state", { maximized: win.isMaximized(), fullScreen: win.isFullScreen() });
}

function send(action, payload) {
  if (win) win.webContents.send("menu", action, payload);
}

// ---------- message boxes ----------

// On Windows and Linux the page draws a Win95 message box (src/dialog.js).
// macOS, or a page that isn't loaded yet, gets the native one.
let dialogSeq = 0;
const pendingDialogs = new Map();

function ask(opts) {
  opts = { title: "RFC Report Generator", buttons: ["OK"], defaultId: 0, cancelId: 0, ...opts };
  if (!FRAMELESS || !win || win.webContents.isLoading()) {
    // Native boxes can't hold a link, so show its text instead.
    const { link, ...native } = opts;
    if (link) native.detail = `${native.detail || ""}\n\n${link.text}`;
    return dialog.showMessageBox(win, { ...native, noLink: true }).then((r) => r.response);
  }
  return new Promise((resolve) => {
    const id = ++dialogSeq;
    pendingDialogs.set(id, resolve);
    send("dialog", { id, ...opts });
  });
}

listen("dialog:result", (_e, id, response) => {
  const resolve = pendingDialogs.get(id);
  if (!resolve) return;
  pendingDialogs.delete(id);
  resolve(Number(response) || 0);
});

async function askSave(message) {
  const r = await ask({
    type: "warning",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message,
    detail: "Your changes will be lost if you don't save them."
  });
  return ["save", "discard", "cancel"][r] || "cancel";
}

// Only the app's own window may call into main.
function fromWin(e) {
  return !!win && e.sender === win.webContents;
}

function handle(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!fromWin(e)) throw new Error("Rejected IPC from unknown sender.");
    return fn(e, ...args);
  });
}

function listen(channel, fn) {
  ipcMain.on(channel, (e, ...args) => { if (fromWin(e)) fn(e, ...args); });
}

// ---------- file handling ----------

// Report paths main has handed to the page this session (open, save, recover). Save without a
// dialog, show-in-folder and the recovery copy only take one of these, so the page can't pick
// its own path.
const grantedPaths = new Set();

function isGranted(p) {
  return typeof p === "string" && grantedPaths.has(p);
}

async function readReport(p) {
  const raw = await fs.readFile(p, "utf8");
  const json = JSON.parse(raw);
  if (!json || json.format !== FORMAT || typeof json.state !== "object") {
    throw new Error("This file isn't an RFC Report draft.");
  }
  return { path: p, state: json.state };
}

async function openPathInWindow(p) {
  try {
    send("open-path", await readReport(p));
    grantedPaths.add(p);
    addRecent(p);
  } catch (err) {
    removeRecent(p);
    if (win) ask({ type: "error", message: "Couldn't open report.", detail: `${p}\n\n${err.message}` });
    else dialog.showErrorBox("Couldn't open report", `${p}\n\n${err.message}`);
  }
}

// ---------- recent files: the numbered list at the bottom of the File menu ----------

const MAX_RECENT = 8;

function addRecent(p) {
  const key = p.toLowerCase();
  settings.recent = [p, ...settings.recent.filter((x) => x.toLowerCase() !== key)].slice(0, MAX_RECENT);
  app.addRecentDocument(p);
  saveSettings();
  buildMenu();
}

function removeRecent(p) {
  const key = p.toLowerCase();
  const before = settings.recent.length;
  settings.recent = settings.recent.filter((x) => x.toLowerCase() !== key);
  if (settings.recent.length === before) return;
  saveSettings();
  buildMenu();
}

// "&1 Folder\report.rfcreport": the number is the access key, and the folder tells
// apart two reports with the same name.
function recentMenuItems() {
  return settings.recent.map((p, i) => ({
    label: `&${i + 1} ${path.join(path.basename(path.dirname(p)), path.basename(p)).replace(/&/g, "&&")}`,
    click: () => openPathInWindow(p)
  }));
}

// ---------- crash recovery: an unsaved report is copied to userData/recovery.json ----------

const recoveryPath = () => path.join(app.getPath("userData"), "recovery.json");

// Writes and deletes run one at a time, in the order they were asked for.
let recoveryQueue = Promise.resolve();
function recoveryOp(fn) {
  recoveryQueue = recoveryQueue.then(fn).catch(() => {});
  return recoveryQueue;
}

listen("recovery:save", (_e, data) => {
  if (!data || typeof data.state !== "object" || !data.state) return;
  const body = JSON.stringify({
    savedAt: new Date().toISOString(),
    filePath: isGranted(data.filePath) ? data.filePath : null,
    state: data.state
  });
  recoveryOp(async () => {
    const tmp = recoveryPath() + ".tmp";
    await fs.writeFile(tmp, body, "utf8");
    await fs.rename(tmp, recoveryPath());
  });
});

listen("recovery:clear", () => recoveryOp(() => fs.unlink(recoveryPath())));

// At startup: if the last session left unsaved changes, offer them back.
async function offerRecovery() {
  let data;
  try {
    data = JSON.parse(await fs.readFile(recoveryPath(), "utf8"));
    if (!data || typeof data.state !== "object" || !data.state) throw new Error("bad recovery file");
  } catch {
    return;
  }
  const name = data.filePath ? path.basename(data.filePath) : "an untitled report";
  const when = new Date(data.savedAt).toLocaleString();
  const r = await ask({
    type: "warning",
    title: "Recover unsaved changes",
    message: "Recover unsaved changes?",
    detail: `RFC Report Generator closed before changes to ${name} were saved.\nLast change: ${when}.`,
    buttons: ["Recover", "Discard"],
    defaultId: 0,
    cancelId: 0 // Esc keeps the work
  });
  if (r === 0) {
    // Main wrote this file, and only with a granted path, so the path can be granted again.
    const filePath = typeof data.filePath === "string" ? data.filePath : null;
    if (filePath) grantedPaths.add(filePath);
    send("recover", { state: data.state, filePath, savedAt: data.savedAt });
  } else await recoveryOp(() => fs.unlink(recoveryPath()));
}

handle("report:open", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Open report",
    properties: ["openFile"],
    filters: [{ name: "RFC Report", extensions: [EXT] }, { name: "All files", extensions: ["*"] }]
  });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  try {
    const report = await readReport(r.filePaths[0]);
    grantedPaths.add(report.path);
    addRecent(report.path);
    return report;
  } catch (err) {
    return { error: err.message };
  }
});

handle("report:save", async (_e, { filePath, saveAs, suggestedName, state }) => {
  // A path the page didn't get from main asks the user, the same as Save As.
  let target = isGranted(filePath) ? filePath : null;
  if (!target || saveAs) {
    const r = await dialog.showSaveDialog(win, {
      title: "Save report",
      defaultPath: filePath || path.join(app.getPath("documents"), `${suggestedName}.${EXT}`),
      filters: [{ name: "RFC Report", extensions: [EXT] }]
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    target = r.filePath;
  }
  try {
    const body = JSON.stringify({ format: FORMAT, version: 1, savedAt: new Date().toISOString(), state }, null, 2);
    await fs.writeFile(target, body, "utf8");
    grantedPaths.add(target);
    addRecent(target);
    return { path: target };
  } catch (err) {
    return { error: err.message };
  }
});

handle("export", async (_e, { kind, content, suggestedName, filePath }) => {
  const ext = kind === "html" ? "html" : "txt";
  const base = filePath ? path.join(path.dirname(filePath), suggestedName) : path.join(app.getPath("documents"), suggestedName);
  const r = await dialog.showSaveDialog(win, {
    title: kind === "html" ? "Export as HTML" : "Export as text",
    defaultPath: `${base}.${ext}`,
    filters: [kind === "html" ? { name: "HTML page", extensions: ["html"] } : { name: "Text file", extensions: ["txt"] }]
  });
  if (r.canceled || !r.filePath) return { canceled: true };
  try {
    // CRLF for text on Windows so Notepad and email clients behave.
    const out = kind === "txt" && process.platform === "win32" ? content.replace(/\r?\n/g, "\r\n") : content;
    await fs.writeFile(r.filePath, out, "utf8");
    return { path: r.filePath };
  } catch (err) {
    return { error: err.message };
  }
});

handle("confirm-discard", () => askSave("Save changes to the current report?"));

handle("show-in-folder", (_e, p) => { if (isGranted(p)) shell.showItemInFolder(p); });

listen("dirty", (_e, value) => {
  dirty = !!value;
  if (win && process.platform === "darwin") win.setDocumentEdited(dirty);
});

listen("close-now", () => {
  forceClose = true;
  if (win) win.close();
});

listen("ruler", (_e, on) => setRuler(!!on, true));

handle("prefill:get", () => settings.prefill);

listen("prefill:set", (_e, p) => {
  settings.prefill = cleanPrefill(p);
  saveSettings();
});

// ---------- right-click menu: spelling suggestions, then the edit commands ----------

// Built on each right-click. Windows and Linux draw it in the page like the menu bar
// (src/chrome.js), which clicks items back by index path; macOS pops up the native menu.
let contextMenu = null;

function showContextMenu(p) {
  const wc = win.webContents;
  const t = [];
  if (p.misspelledWord) {
    for (const w of p.dictionarySuggestions.slice(0, 6)) {
      t.push({ label: w.replace(/&/g, "&&"), click: () => wc.replaceMisspelling(w) });
    }
    if (!p.dictionarySuggestions.length) t.push({ label: "(No spelling suggestions)", enabled: false });
    t.push({ type: "separator" });
    t.push({ label: "A&dd to Dictionary", click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
    t.push({ type: "separator" });
  }
  const f = p.editFlags;
  if (p.isEditable) {
    t.push(
      { role: "undo", label: "&Undo", enabled: f.canUndo },
      { type: "separator" },
      { role: "cut", label: "Cu&t", enabled: f.canCut },
      { role: "copy", label: "&Copy", enabled: f.canCopy },
      { role: "paste", label: "&Paste", enabled: f.canPaste },
      { role: "delete", label: "De&lete", enabled: f.canDelete },
      { type: "separator" },
      { role: "selectAll", label: "Select &All", enabled: f.canSelectAll }
    );
  } else if (p.selectionText.trim()) {
    t.push({ role: "copy", label: "&Copy", enabled: f.canCopy });
  }
  if (!t.length) return;
  contextMenu = Menu.buildFromTemplate(t);
  if (FRAMELESS) send("context-menu", { x: p.x, y: p.y, items: menuModel(contextMenu.items, "") });
  else contextMenu.popup({ window: win });
}

listen("context-menu:click", (_e, id) => {
  const item = contextMenu && menuItemAt(id, contextMenu.items);
  if (item && item.enabled && !item.submenu) item.click(undefined, win, win.webContents);
});

// ---------- window controls for the in-page title bar ----------

listen("win:minimize", () => win.minimize());
listen("win:toggle-maximize", () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
listen("win:close", () => win.close());

// ---------- menu ----------

// The in-page menu bar renders this model. Items are addressed by index path ("2.0"),
// and clicks run the real MenuItem, so roles (Undo, Zoom In, ...) behave natively.
function menuModel(items, prefix) {
  return items.filter((i) => i.visible).map((i) => {
    const id = prefix + items.indexOf(i);
    return {
      id,
      label: i.label,
      type: i.type,
      enabled: i.enabled,
      checked: i.checked,
      accelerator: (i.accelerator || "").replace(/CommandOrControl|CmdOrCtrl|Control/g, "Ctrl").replace(/\bPlus\b/, "+"),
      submenu: i.submenu ? menuModel(i.submenu.items, id + ".") : null
    };
  });
}

function menuItemAt(id, root = Menu.getApplicationMenu()?.items) {
  let items = root;
  let item = null;
  for (const n of String(id).split(".").map(Number)) {
    item = items && items[n];
    if (!item) return null;
    items = item.submenu && item.submenu.items;
  }
  return item;
}

handle("menu:get", () => menuModel(Menu.getApplicationMenu()?.items || [], ""));

listen("menu:click", (_e, id) => {
  const item = menuItemAt(id);
  if (item && item.enabled && !item.submenu) item.click(undefined, win, win.webContents);
});

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "&File",
      submenu: [
        { label: "&New", accelerator: "CmdOrCtrl+N", click: () => send("new") },
        { label: "&Open...", accelerator: "CmdOrCtrl+O", click: () => send("open") },
        { type: "separator" },
        { label: "&Save", accelerator: "CmdOrCtrl+S", click: () => send("save") },
        { label: "Save &As...", accelerator: "CmdOrCtrl+Shift+S", click: () => send("save-as") },
        { type: "separator" },
        { label: "Export as &Text...", accelerator: "CmdOrCtrl+E", click: () => send("export-txt") },
        { label: "Export as &HTML...", accelerator: "CmdOrCtrl+Shift+E", click: () => send("export-html") },
        { type: "separator" },
        ...(settings.recent.length ? [...recentMenuItems(), { type: "separator" }] : []),
        isMac ? { role: "close" } : { role: "quit", label: "E&xit" }
      ]
    },
    {
      label: "&Edit",
      submenu: [
        { role: "undo", label: "&Undo" },
        { role: "redo", label: "&Redo" },
        { type: "separator" },
        { role: "cut", label: "Cu&t" },
        { role: "copy", label: "&Copy" },
        { role: "paste", label: "&Paste" },
        { role: "delete", label: "De&lete" },
        { type: "separator" },
        { role: "selectAll", label: "Select &All" },
        { type: "separator" },
        { label: "S&ettings...", accelerator: "CmdOrCtrl+,", click: () => send("settings") }
      ]
    },
    {
      label: "&Report",
      submenu: [
        { label: "&Copy as Text", accelerator: "CmdOrCtrl+Shift+C", click: () => send("copy-txt") },
        { label: "Copy as HTML &Page", click: () => send("copy-html") },
        { type: "separator" },
        {
          id: "ruler", label: "&Ruler", type: "checkbox", accelerator: "CmdOrCtrl+L",
          checked: settings.ruler, click: (item) => setRuler(item.checked)
        },
        { type: "separator" },
        { label: "Load &Example", click: () => send("example") }
      ]
    },
    {
      label: "&View",
      submenu: [
        // The zoomIn role only listens for Ctrl+Plus (Ctrl+Shift+= on US keyboards).
        // Show Ctrl+= as browsers do; hidden items add Ctrl+Plus and the numpad keys.
        { role: "zoomIn", label: "Zoom &In", accelerator: "CmdOrCtrl+=" },
        { role: "zoomOut", label: "Zoom &Out" },
        { role: "resetZoom", label: "&Actual Size" },
        { role: "zoomIn", accelerator: "CmdOrCtrl+Plus", visible: false },
        { role: "zoomIn", accelerator: "CmdOrCtrl+numadd", visible: false },
        { role: "zoomOut", accelerator: "CmdOrCtrl+numsub", visible: false },
        { role: "resetZoom", accelerator: "CmdOrCtrl+num0", visible: false },
        { type: "separator" },
        { role: "togglefullscreen", label: "&Full Screen" },
        { type: "separator" },
        {
          label: "&Theme",
          submenu: THEMES.map((t) => ({
            label: "&" + t[0].toUpperCase() + t.slice(1),
            type: "radio",
            checked: settings.theme === t,
            click: () => setTheme(t)
          }))
        }
      ]
    },
    {
      label: "&Help",
      submenu: [
        {
          label: "&About RFC Report Generator",
          click: async () => {
            // The Win95 box shows the repo as a link. macOS's native box can't, so it gets a button.
            const r = await ask({
              type: "info",
              title: "About RFC Report Generator",
              message: `RFC Report Generator ${app.getVersion()}`,
              detail: "\nIt was probably DNS.",
              link: { text: REPO_URL.replace(/^https:\/\//, ""), url: REPO_URL },
              buttons: FRAMELESS ? ["OK"] : ["OK", "GitHub"],
              defaultId: 0,
              cancelId: 0
            });
            if (!FRAMELESS && r === 1) shell.openExternal(REPO_URL);
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Keep the window background matched to the page, so resizes don't flash the wrong color.
nativeTheme.on("updated", () => {
  if (win) win.setBackgroundColor(currentBg());
});

app.whenReady().then(async () => {
  await loadSettings();
  nativeTheme.themeSource = settings.theme;
  // Copy buttons need clipboard writes. Deny everything else (camera, mic, notifications, ...).
  const ALLOW = new Set(["clipboard-sanitized-write"]);
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(ALLOW.has(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => ALLOW.has(perm));
  buildMenu();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
