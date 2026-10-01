/* Win95-style title bar and menu bar. The menu comes from main (the native app menu),
   so shortcuts, roles and checked states have one source of truth. */
(function () {
  "use strict";

  var api = window.api;
  if (!api.frameless) return; // macOS keeps the native title bar and menu

  var body = document.body;
  var chrome = document.getElementById("chrome");
  var titleText = document.getElementById("titleText");
  var bar = document.getElementById("menubar");
  var maxBtn = document.getElementById("capMax");

  chrome.hidden = false;
  body.classList.add("framed");

  // ---------- title bar ----------

  function syncTitle() { titleText.textContent = document.title; }
  new MutationObserver(syncTitle).observe(document.querySelector("title"), { childList: true, characterData: true, subtree: true });
  syncTitle();

  window.addEventListener("focus", function () { body.classList.remove("inactive"); });
  window.addEventListener("blur", function () { body.classList.add("inactive"); closeMenu(); setHot(-1); });

  document.getElementById("capMin").addEventListener("click", function () { api.minimize(); });
  maxBtn.addEventListener("click", function () { api.toggleMaximize(); });
  document.getElementById("capClose").addEventListener("click", function () { api.closeWindow(); });

  api.onMenu(function (action, payload) {
    if (action !== "win-state") return;
    body.classList.toggle("maximized", !!(payload.maximized || payload.fullScreen));
    maxBtn.classList.toggle("restore", !!payload.maximized);
    maxBtn.setAttribute("aria-label", payload.maximized ? "Restore" : "Maximize");
  });

  // ---------- pixel glyphs ----------

  // Win95 menu glyphs, one string per pixel row ("#" = ink).
  var GLYPHS = {
    tick:  ["......#", ".....##", "#...###", "##.###.", "#####..", ".###...", "..#...."],
    dot:   [".###.", "#####", "#####", "#####", ".###."],
    arrow: ["#...", "##..", "###.", "####", "###.", "##..", "#..."]
  };

  function glyph(name) {
    var rows = GLYPHS[name];
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", rows[0].length);
    svg.setAttribute("height", rows.length);
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("aria-hidden", "true");
    var d = "";
    rows.forEach(function (row, y) {
      row.replace(/#+/g, function (run, x) { d += "M" + x + " " + y + "h" + run.length + "v1h-" + run.length + "z"; });
    });
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "currentColor");
    svg.appendChild(path);
    return svg;
  }

  // ---------- menu bar ----------

  var topEls = [];     // top-level buttons
  var CTX = -2;
  var openIdx = -1;    // open top-level menu, CTX for the right-click menu, or -1
  var hotIdx = -1;     // highlighted top-level item in keyboard mode (Alt or F10), or -1
  var panels = [];     // open dropdowns: [{ el, items, rows, keys, active }]

  // A menu opened from the keyboard can appear under a resting pointer. As in Windows,
  // hover only selects once the mouse actually moves.
  var mouseMoved = true;
  var lastXY = "";
  document.addEventListener("mousemove", function (e) {
    var xy = e.screenX + "," + e.screenY;
    if (xy !== lastXY) { lastXY = xy; mouseMoved = true; }
  }, true);

  // "&File" -> F underlined; "&&" is a literal ampersand.
  function labelNodes(label) {
    var frag = document.createDocumentFragment();
    var key = null;
    String(label).split(/(&&|&.)/).forEach(function (p) {
      if (p === "&&") frag.appendChild(document.createTextNode("&"));
      else if (p.length === 2 && p[0] === "&") {
        var u = document.createElement("u");
        u.textContent = p[1];
        frag.appendChild(u);
        if (!key) key = p[1].toLowerCase();
      } else if (p) frag.appendChild(document.createTextNode(p));
    });
    return { frag: frag, key: key };
  }

  function buildBar(model) {
    bar.replaceChildren();
    topEls = model.map(function (m, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "mtop";
      b.tabIndex = -1;
      b.setAttribute("role", "menuitem");
      b.setAttribute("aria-haspopup", "true");
      var l = labelNodes(m.label);
      b.appendChild(l.frag);
      b.dataset.key = l.key || "";
      // Keep focus in the form, so Edit > Copy acts on the field you were in.
      b.addEventListener("mousedown", function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        setHot(-1);
        if (openIdx === i) closeMenu(); else openMenu(i, false);
      });
      b.addEventListener("mousemove", function () { if (mouseMoved && openIdx !== -1 && openIdx !== i) openMenu(i, false); });
      bar.appendChild(b);
      return b;
    });
  }

  function setHot(i) {
    if (hotIdx !== -1 && topEls[hotIdx]) topEls[hotIdx].classList.remove("hot");
    hotIdx = i;
    if (i !== -1) topEls[i].classList.add("hot");
  }

  function closePanelsFrom(level) {
    while (panels.length > level) panels.pop().el.remove();
  }

  function closeMenu() {
    closePanelsFrom(0);
    if (openIdx >= 0 && topEls[openIdx]) topEls[openIdx].classList.remove("open");
    openIdx = -1;
  }

  function openMenu(i, fromKeyboard) {
    closeMenu();
    setHot(-1);
    if (fromKeyboard) mouseMoved = false;
    openIdx = i;
    topEls[i].classList.add("open");
    // Refetch so checkbox and radio states are current.
    api.getMenu().then(function (model) {
      if (openIdx !== i) return;
      var r = topEls[i].getBoundingClientRect();
      openPanel(model[i].submenu || [], r.left, r.bottom, 0);
      if (fromKeyboard) move(0, 1);
    });
  }

  function openPanel(items, x, y, level) {
    closePanelsFrom(level);
    var el = document.createElement("div");
    el.className = "mdrop";
    el.setAttribute("role", "menu");
    var panel = { el: el, items: items, rows: [], keys: [], active: -1 };
    items.forEach(function (it, idx) {
      if (it.type === "separator") {
        el.appendChild(Object.assign(document.createElement("div"), { className: "msep" }));
        panel.rows.push(null);
        panel.keys.push(null);
        return;
      }
      var row = document.createElement("div");
      row.className = "mitem" + (it.enabled ? "" : " disabled");
      row.setAttribute("role", it.type === "checkbox" ? "menuitemcheckbox" : it.type === "radio" ? "menuitemradio" : "menuitem");
      if (it.type === "checkbox" || it.type === "radio") row.setAttribute("aria-checked", String(!!it.checked));
      var mark = document.createElement("span");
      mark.className = "mmark";
      if (it.checked) mark.appendChild(glyph(it.type === "radio" ? "dot" : "tick"));
      var text = document.createElement("span");
      var l = labelNodes(it.label);
      text.appendChild(l.frag);
      var acc = document.createElement("span");
      acc.className = "macc";
      acc.textContent = it.accelerator || "";
      var arrow = document.createElement("span");
      arrow.className = "marrow";
      if (it.submenu) arrow.appendChild(glyph("arrow"));
      row.append(mark, text, acc, arrow);
      row.addEventListener("mousedown", function (e) { e.preventDefault(); });
      row.addEventListener("mousemove", function () { if (mouseMoved && panels[level] && panels[level].active !== idx) setActive(level, idx); });
      // mouseup, not click: press on the menu title, drag down, release on an item.
      row.addEventListener("mouseup", function (e) { if (e.button === 0) activate(level, idx); });
      el.appendChild(row);
      panel.rows.push(row);
      panel.keys.push(l.key);
    });
    document.body.appendChild(el);
    // Keep the panel inside the window.
    var w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(0, Math.min(x, window.innerWidth - w)) + "px";
    el.style.top = Math.max(0, Math.min(y, window.innerHeight - h)) + "px";
    panels[level] = panel;
    return panel;
  }

  function highlight(level, idx) {
    var p = panels[level];
    p.rows.forEach(function (r, j) { if (r) r.classList.toggle("active", j === idx); });
    p.active = idx;
    closePanelsFrom(level + 1);
  }

  function setActive(level, idx) {
    if (!panels[level]) return;
    highlight(level, idx);
    var it = panels[level].items[idx];
    if (it && it.submenu && it.enabled) openSub(level, idx, false);
  }

  function openSub(level, idx, fromKeyboard) {
    var r = panels[level].rows[idx].getBoundingClientRect();
    openPanel(panels[level].items[idx].submenu, r.right - 3, r.top - 3, level + 1);
    if (fromKeyboard) move(level + 1, 1);
  }

  function activate(level, idx) {
    var it = panels[level] && panels[level].items[idx];
    if (!it || !it.enabled || it.type === "separator") return;
    if (it.submenu) { openSub(level, idx, true); return; }
    var ctx = openIdx === CTX;
    closeMenu();
    if (ctx) api.clickContextMenu(it.id); else api.clickMenu(it.id);
  }

  // ---------- right-click menu ----------

  // Main builds it (spelling suggestions, Cut, Copy, ...) and sends the model here.
  // Place it at the pointer in page coordinates, which stay right when zoomed.
  var ctxAt = null;
  document.addEventListener("contextmenu", function (e) { ctxAt = { x: e.clientX, y: e.clientY }; });

  api.onMenu(function (action, payload) {
    if (action !== "context-menu") return;
    closeMenu();
    setHot(-1);
    openIdx = CTX;
    var at = ctxAt || payload;
    ctxAt = null;
    openPanel(payload.items, at.x, at.y, 0);
  });

  // Move the highlight in a panel, skipping separators and disabled items.
  function move(level, dir) {
    var p = panels[level];
    if (!p) return;
    var n = p.items.length;
    for (var step = 1, j = p.active; step <= n; step++) {
      j = (j + dir + n) % n;
      if (p.items[j].type !== "separator" && p.items[j].enabled) { highlight(level, j); return; }
    }
  }

  function topByKey(key) {
    return topEls.findIndex(function (b) { return b.dataset.key === key; });
  }

  // ---------- keyboard ----------

  var altAlone = false; // Alt pressed with no other key since: a tap toggles menu bar mode

  document.addEventListener("keydown", function (e) {
    var ctx = openIdx === CTX;
    if (body.classList.contains("modal") && !ctx) return;
    altAlone = e.key === "Alt" && !e.repeat ? true : e.key === "Alt" ? altAlone : false;
    var key = e.key.length === 1 ? e.key.toLowerCase() : null;
    var handled = true;

    if (openIdx === -1 && hotIdx === -1) {
      if (e.key === "F10" && !e.shiftKey && !e.ctrlKey && !e.altKey) setHot(0);
      else if (e.altKey && !e.ctrlKey && !e.metaKey && key && topByKey(key) !== -1) openMenu(topByKey(key), true);
      else handled = false;
    } else if (openIdx === -1) {
      // Menu bar mode: a top-level item is highlighted, nothing is open.
      var n = topEls.length;
      switch (e.key) {
        case "ArrowRight": setHot((hotIdx + 1) % n); break;
        case "ArrowLeft": setHot((hotIdx - 1 + n) % n); break;
        case "ArrowDown": case "ArrowUp": case "Enter": case " ": openMenu(hotIdx, true); break;
        case "Escape": case "F10": setHot(-1); break;
        case "Alt": break;
        default:
          if (key && topByKey(key) !== -1) openMenu(topByKey(key), true);
          else if (key) setHot(-1);
          else handled = false;
      }
    } else {
      var level = panels.length - 1;
      var p = panels[level];
      switch (e.key) {
        case "Escape":
          // Closes one level; from the top level, drop back to menu bar mode as Windows does.
          if (level > 0) closePanelsFrom(level);
          else if (ctx) closeMenu();
          else { var i = openIdx; closeMenu(); setHot(i); }
          break;
        case "ArrowDown": move(level, 1); break;
        case "ArrowUp": move(level, -1); break;
        case "ArrowRight":
          if (p && p.active !== -1 && p.items[p.active].submenu) openSub(level, p.active, true);
          else if (!ctx) openMenu((openIdx + 1) % topEls.length, true);
          break;
        case "ArrowLeft":
          if (level > 0) closePanelsFrom(level);
          else if (!ctx) openMenu((openIdx - 1 + topEls.length) % topEls.length, true);
          break;
        case "Enter": case " ":
          if (p && p.active !== -1) activate(level, p.active);
          break;
        case "F10": closeMenu(); break;
        case "Alt": break;
        default:
          // The underlined letter picks the item.
          var k = p ? p.keys.indexOf(key) : -1;
          if (key && k !== -1) { highlight(level, k); activate(level, k); }
          else if (!key) handled = false;
      }
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      // In the Settings dialog, keep keys (Escape above all) from reaching the dialog too.
      if (ctx) e.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener("keyup", function (e) {
    if (e.key !== "Alt" || !altAlone || body.classList.contains("modal")) return;
    altAlone = false;
    e.preventDefault();
    if (openIdx !== -1) closeMenu();
    else setHot(hotIdx === -1 ? 0 : -1);
  }, true);

  document.addEventListener("mousedown", function (e) {
    if (hotIdx !== -1 && !e.target.closest(".menubar")) setHot(-1);
    if (openIdx !== -1 && !e.target.closest(".mdrop, .menubar")) closeMenu();
  });
  window.addEventListener("resize", closeMenu);

  api.getMenu().then(buildBar);
})();
