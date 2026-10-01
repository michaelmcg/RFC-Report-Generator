(function () {
  "use strict";

  var R = window.Report;
  var api = window.api;
  var W = R.W;

  var form = document.getElementById("form");
  var out = document.getElementById("out");
  var status = document.getElementById("status");
  var ruler = document.getElementById("ruler");
  var showRuler = document.getElementById("showRuler");
  var filePathEl = document.getElementById("filePath");
  var revealBtn = document.getElementById("reveal");

  var filePath = null;     // path of the open .rfcreport file, or null if untitled
  var savedSnapshot = "";  // serialized state at last save/open
  var dirty = false;
  var lines = [];
  var prefill = {};
  var note = "";           // a one-off status message for the next update()        // Edit > Settings values for new reports, kept by main in settings.json

  // ---------- form <-> state ----------

  function rowEl(list, data) {
    var cols = R.LISTS[list];
    var row = document.createElement("div");
    row.className = "row";
    row.style.gridTemplateColumns = cols.map(function (c) { return "minmax(0," + c[2] + ")"; }).join(" ") + " auto";
    cols.forEach(function (c) {
      var inp = document.createElement("input");
      inp.dataset.k = c[0];
      inp.placeholder = c[1];
      inp.setAttribute("aria-label", c[1]);
      inp.value = (data && data[c[0]]) || "";
      row.appendChild(inp);
    });
    var rm = document.createElement("button");
    rm.type = "button";
    rm.textContent = "Remove";
    rm.addEventListener("click", function () { row.remove(); update(); });
    row.appendChild(rm);
    return row;
  }

  function collect() {
    var s = { f: {}, lists: {} };
    form.querySelectorAll("[data-f]").forEach(function (el) {
      s.f[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value;
    });
    Object.keys(R.LISTS).forEach(function (list) {
      s.lists[list] = Array.prototype.map.call(
        form.querySelectorAll('[data-list="' + list + '"] .row'),
        function (row) {
          var o = {};
          row.querySelectorAll("input").forEach(function (i) { o[i.dataset.k] = i.value; });
          return o;
        });
    });
    return R.normalize(s);
  }

  // Status choices come from Edit > Settings. A report whose status isn't in the list
  // (an older file, or a choice since removed) keeps it as an extra choice.
  var statusSel = form.querySelector('[data-f="status"]');
  function setStatusOptions(current) {
    var list = R.statusList(prefill);
    if (current && list.indexOf(current) === -1) list.push(current);
    statusSel.replaceChildren.apply(statusSel, list.map(function (x) { return new Option(x); }));
    statusSel.value = current || list[0];
  }

  function populate(state) {
    var s = R.normalize(state);
    setStatusOptions(s.f.status);
    form.querySelectorAll("[data-f]").forEach(function (el) {
      var v = s.f[el.dataset.f];
      if (el.type === "checkbox") el.checked = !!v; else el.value = v == null ? "" : v;
    });
    Object.keys(R.LISTS).forEach(function (list) {
      var box = form.querySelector('[data-list="' + list + '"]');
      box.replaceChildren();
      s.lists[list].forEach(function (r) { box.appendChild(rowEl(list, r)); });
    });
  }

  // ---------- rendering ----------

  function overWarning() {
    var over = lines.filter(function (l) { return l.length > W; }).length;
    return over ? over + " line" + (over > 1 ? "s" : "") + " over " + W + " characters (highlighted)." : "";
  }

  // Any message also carries the over-length warning, so it never hides the highlight's reason.
  function say(msg, bad) {
    var warn = overWarning();
    if (warn && msg.indexOf(warn) === -1) msg += " " + warn;
    status.className = "status" + (bad || warn ? " bad" : "");
    status.textContent = msg;
  }

  function lineStatus() {
    say(lines.length + " lines. " + (overWarning() || "All lines fit in " + W + " characters."));
  }

  function basename(p) { return String(p).split(/[\\/]/).pop(); }

  function refreshChrome() {
    var name = filePath ? basename(filePath) : "Untitled";
    document.title = name + (dirty ? " *" : "") + " - RFC Report Generator";
    filePathEl.textContent = filePath || "Not saved yet";
    filePathEl.title = filePath || "";
    revealBtn.hidden = !filePath;
  }

  function update() {
    var s = collect();
    form.querySelectorAll("fieldset[data-sec]").forEach(function (fs) {
      fs.classList.toggle("off", !fs.querySelector("legend input").checked);
    });

    lines = R.build(s);
    var frag = document.createDocumentFragment();
    lines.forEach(function (l, i) {
      if (i) frag.appendChild(document.createTextNode("\n"));
      if (l.length > W) {
        var span = document.createElement("span");
        span.className = "over";
        span.textContent = l;
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(l));
      }
    });
    out.replaceChildren(frag);
    if (note) { say(note); note = ""; } else lineStatus();

    var nowDirty = JSON.stringify(s) !== savedSnapshot;
    if (nowDirty !== dirty) {
      dirty = nowDirty;
      api.setDirty(dirty);
    }
    if (dirty) scheduleRecovery(); else cancelRecovery();
    refreshChrome();
  }

  // ---------- crash recovery ----------

  // While there are unsaved changes, main keeps a copy that the next start offers back.
  // It is written 2 seconds after the last edit, and deleted once the report is clean.
  var recoveryTimer = null;
  var recoveryWritten = false;

  function scheduleRecovery() {
    clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(function () {
      api.saveRecovery({ state: collect(), filePath: filePath });
      recoveryWritten = true;
    }, 2000);
  }

  function cancelRecovery() {
    clearTimeout(recoveryTimer);
    if (recoveryWritten) api.clearRecovery();
    recoveryWritten = false;
  }

  function recover(payload) {
    loadState(payload.state, payload.filePath);
    // Recovered work is unsaved, so mark it dirty (and keep a new recovery copy).
    savedSnapshot = "";
    update();
    say("Recovered unsaved changes" + (payload.filePath ? " to " + basename(payload.filePath) : "") + ".");
  }

  function loadState(state, path) {
    populate(state);
    filePath = path || null;
    savedSnapshot = JSON.stringify(collect());
    dirty = false;
    api.setDirty(false);
    update();
  }

  // ---------- file operations ----------

  async function save(saveAs) {
    var state = collect();
    var r = await api.saveReport({
      filePath: filePath,
      saveAs: !!saveAs,
      suggestedName: R.suggestedName(state),
      state: state
    });
    if (r.canceled) return false;
    if (r.error) { say("Save failed: " + r.error, true); return false; }
    filePath = r.path;
    savedSnapshot = JSON.stringify(state);
    dirty = false;
    api.setDirty(false);
    cancelRecovery();
    refreshChrome();
    say("Saved " + basename(r.path) + ".");
    return true;
  }

  // Ask before throwing away unsaved work. Resolves true if it's OK to continue.
  async function okToDiscard() {
    if (!dirty) return true;
    var choice = await api.confirmDiscard();
    if (choice === "cancel") return false;
    if (choice === "save") return save(false);
    return true;
  }

  async function newReport() {
    if (!(await okToDiscard())) return;
    loadState(R.fresh(prefill), null);
    say("New report.");
  }

  async function openReport() {
    if (!(await okToDiscard())) return;
    var r = await api.openReport();
    if (r.canceled) return;
    if (r.error) { say("Couldn't open file: " + r.error, true); return; }
    loadState(r.state, r.path);
    say("Opened " + basename(r.path) + ".");
  }

  async function openFromPath(payload) {
    if (!(await okToDiscard())) return;
    loadState(payload.state, payload.path);
    say("Opened " + basename(payload.path) + ".");
  }

  async function loadExample() {
    if (!(await okToDiscard())) return;
    loadState(R.example(), null);
    // The example is unsaved content, so mark it dirty.
    savedSnapshot = "";
    update();
    say("Example loaded.");
  }

  async function exportAs(kind) {
    var state = collect();
    var content = kind === "html" ? R.toHtml(lines, state.f.title) : R.toText(lines);
    var r = await api.exportFile({
      kind: kind,
      content: content,
      suggestedName: R.suggestedName(state),
      filePath: filePath
    });
    if (r.canceled) return;
    if (r.error) { say("Export failed: " + r.error, true); return; }
    say("Exported " + basename(r.path) + ".");
  }

  async function copy(kind) {
    var state = collect();
    var str = kind === "html" ? R.toHtml(lines, state.f.title) : R.toText(lines);
    try {
      await navigator.clipboard.writeText(str);
      say((kind === "html" ? "HTML page" : "Report text") + " copied to clipboard.");
    } catch (e) {
      say("Copy failed. Select the preview and copy it manually.", true);
    }
  }

  async function editSettings() {
    var p = await window.Settings.open(prefill);
    if (!p) return;
    prefill = p;
    api.setPrefill(p);
    // An untouched new report picks the settings up at once; otherwise just refresh the Status choices.
    if (!filePath && !dirty) loadState(R.fresh(prefill), null);
    else { setStatusOptions(statusSel.value); update(); }
    say("Settings saved. New reports will use them.");
  }

  // ---------- ruler ----------

  var tens = "", ones = "";
  for (var i = 1; i <= W; i++) {
    tens += i % 10 === 0 ? String(i / 10) : " ";
    ones += String(i % 10);
  }
  ruler.textContent = tens + "\n" + ones;

  function setRuler(on) {
    showRuler.checked = on;
    ruler.hidden = !on;
  }
  // The checkbox and the Report > Ruler menu item share one saved setting.
  showRuler.addEventListener("change", function () {
    setRuler(showRuler.checked);
    api.setRuler(showRuler.checked);
  });

  // ---------- events ----------

  form.addEventListener("submit", function (e) { e.preventDefault(); });

  // Picking a category ticks that category's sections. Unticked sections keep their text.
  // This runs before the form's own change listener, which then redraws the report.
  var categorySel = form.querySelector('[data-f="category"]');
  categorySel.addEventListener("change", function () {
    var ids = R.templates(prefill)[categorySel.value] || [];
    R.SECTIONS.forEach(function (id) {
      var box = form.querySelector('[data-f="sec_' + id + '"]');
      if (box) box.checked = ids.indexOf(id) !== -1;
    });
    note = "Sections set for " + categorySel.value + " reports.";
  });
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.querySelectorAll("[data-add]").forEach(function (b) {
    b.addEventListener("click", function () {
      var list = b.dataset.add;
      var el = rowEl(list, null);
      form.querySelector('[data-list="' + list + '"]').appendChild(el);
      el.querySelector("input").focus();
      update();
    });
  });

  document.getElementById("save").addEventListener("click", function () { save(false); });
  document.getElementById("exportTxt").addEventListener("click", function () { exportAs("txt"); });
  document.getElementById("exportHtml").addEventListener("click", function () { exportAs("html"); });
  document.getElementById("copyText").addEventListener("click", function () { copy("txt"); });
  revealBtn.addEventListener("click", function () { api.showInFolder(filePath); });

  api.onMenu(function (action, payload) {
    // Shortcuts still reach main while a message box is up; ignore them until it closes.
    if (window.Dialog.isOpen() && action !== "ruler-set" && action !== "save-then-close") return;
    switch (action) {
      case "new": newReport(); break;
      case "open": openReport(); break;
      case "open-path": openFromPath(payload); break;
      case "save": save(false); break;
      case "save-as": save(true); break;
      case "save-then-close":
        save(false).then(function (ok) { if (ok) api.closeNow(); });
        break;
      case "export-txt": exportAs("txt"); break;
      case "export-html": exportAs("html"); break;
      case "copy-txt": copy("txt"); break;
      case "copy-html": copy("html"); break;
      case "ruler-set": setRuler(!!payload); break;
      case "example": loadExample(); break;
      case "recover": recover(payload); break;
      case "settings": editSettings(); break;
    }
  });

  // ---------- init ----------

  loadState(R.defaults(), null);
  api.getPrefill().then(function (p) {
    prefill = p || {};
    // Unless a file was opened meanwhile, start from the prefilled report.
    if (!filePath && !dirty) loadState(R.fresh(prefill), null);
  });
})();
