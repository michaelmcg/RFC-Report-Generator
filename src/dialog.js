/* Win95-style message box. Main asks for one through the "dialog" message (see ask() in
   main.js); Dialog.show() resolves with the index of the button chosen.
   Pass opts.content (an element) to show a form in place of the icon and text. */
(function () {
  "use strict";

  var api = window.api;
  var SVG = "http://www.w3.org/2000/svg";
  var queue = [];
  var current = null;

  // 32x32 icons in the Windows 95 style: hard pixel edges and a grey drop shadow.
  var ICONS = {
    warning: [
      ["path", { d: "M17 5 L31 31 H3 Z", fill: "#808080" }],
      ["path", { d: "M15 2 L29 29 H1 Z", fill: "#ffff00", stroke: "#000", "stroke-width": "1.5", "stroke-linejoin": "miter" }],
      ["rect", { x: "13", y: "10", width: "4", height: "11", fill: "#000" }],
      ["rect", { x: "13", y: "23", width: "4", height: "3", fill: "#000" }]
    ],
    info: [
      ["path", { d: "M18 4 C26 4 31 9 31 15 C31 21 26 26 18 26 L9 31 L12 25 C7 23 5 19 5 15 C5 9 10 4 18 4 Z", fill: "#808080" }],
      ["path", { d: "M16 2 C24 2 29 7 29 13 C29 19 24 24 16 24 L7 29 L10 23 C5 21 3 17 3 13 C3 7 8 2 16 2 Z", fill: "#fff", stroke: "#000", "stroke-width": "1.2" }],
      ["rect", { x: "14", y: "5", width: "4", height: "3", fill: "#0000ff" }],
      ["path", { d: "M12 10h6v9h2v2h-8v-2h2v-7h-2z", fill: "#0000ff" }]
    ],
    error: [
      ["circle", { cx: "17", cy: "17", r: "14", fill: "#808080" }],
      ["circle", { cx: "15", cy: "15", r: "14", fill: "#ff0000", stroke: "#000", "stroke-width": "1.2" }],
      ["path", { d: "M9 9 L21 21 M21 9 L9 21", stroke: "#fff", "stroke-width": "3.5" }]
    ]
  };

  function icon(type) {
    var svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("width", "32");
    svg.setAttribute("height", "32");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "dlg-icon");
    svg.setAttribute("shape-rendering", "crispEdges");
    (ICONS[type] || ICONS.info).forEach(function (s) {
      var el = document.createElementNS(SVG, s[0]);
      Object.keys(s[1]).forEach(function (k) { el.setAttribute(k, s[1][k]); });
      svg.appendChild(el);
    });
    return svg;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function show(opts) {
    return new Promise(function (resolve) {
      queue.push({ opts: opts, resolve: resolve });
      if (!current) next();
    });
  }

  function next() {
    var job = queue.shift();
    if (!job) return;
    var o = job.opts;
    var buttons = o.buttons && o.buttons.length ? o.buttons : ["OK"];
    var cancelId = o.cancelId != null ? o.cancelId : buttons.length - 1;
    var restoreFocus = document.activeElement;

    var overlay = el("div", "dlg-overlay");
    var form = o.content || null;
    var box = el("div", form ? "dlg wide" : "dlg");
    box.setAttribute("role", o.type === "warning" || o.type === "error" ? "alertdialog" : "dialog");
    box.setAttribute("aria-modal", "true");

    var bar = el("div", "dlg-title");
    var title = el("span", "dlg-title-text", o.title || document.title);
    title.id = "dlgTitle";
    box.setAttribute("aria-labelledby", "dlgTitle");
    var x = el("button", "cap");
    x.type = "button";
    x.tabIndex = -1;
    x.setAttribute("aria-label", "Close");
    x.appendChild(document.getElementById("capClose").firstElementChild.cloneNode(true));
    bar.append(title, x);

    var main = el("div", "dlg-body");
    if (form) {
      main.appendChild(form);
    } else {
      var text = el("div", "dlg-text");
      var msg = el("p", "dlg-msg", o.message || "");
      msg.id = "dlgMsg";
      box.setAttribute("aria-describedby", "dlgMsg");
      text.appendChild(msg);
      if (o.detail) text.appendChild(el("p", "dlg-detail", o.detail));
      // target=_blank goes to main's window-open handler, which opens http(s) links in the browser.
      if (o.link && /^https:\/\//.test(o.link.url)) {
        var a = el("a", null, o.link.text);
        a.href = o.link.url;
        a.target = "_blank";
        a.rel = "noopener";
        var p = el("p", "dlg-detail");
        p.appendChild(a);
        text.appendChild(p);
      }
      main.append(icon(o.type), text);
    }

    var row = el("div", "dlg-buttons");
    var btns = buttons.map(function (label, i) {
      var b = el("button", i === o.defaultId ? "default" : "", label);
      b.type = "button";
      b.addEventListener("click", function () { finish(i); });
      // In Windows the thick default border follows keyboard focus between buttons.
      b.addEventListener("focus", function () {
        btns.forEach(function (x) { x.classList.toggle("default", x === b); });
      });
      row.appendChild(b);
      return b;
    });

    box.append(bar, main, row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.body.classList.add("modal");

    // Centre in the window, then let the title bar drag it like a real window.
    box.style.left = Math.max(0, (window.innerWidth - box.offsetWidth) / 2) + "px";
    box.style.top = Math.max(0, (window.innerHeight - box.offsetHeight) / 2.5) + "px";
    bar.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || e.target.closest(".cap")) return;
      var sx = e.clientX - box.offsetLeft, sy = e.clientY - box.offsetTop;
      bar.setPointerCapture(e.pointerId);
      function mv(ev) {
        box.style.left = Math.min(Math.max(0, ev.clientX - sx), window.innerWidth - box.offsetWidth) + "px";
        box.style.top = Math.min(Math.max(0, ev.clientY - sy), window.innerHeight - bar.offsetHeight) + "px";
      }
      function up() { bar.removeEventListener("pointermove", mv); bar.removeEventListener("pointerup", up); }
      bar.addEventListener("pointermove", mv);
      bar.addEventListener("pointerup", up);
    });
    x.addEventListener("click", function () { finish(cancelId); });

    // Clicking outside the box keeps focus in it, as a modal should.
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) e.preventDefault(); });

    // Tab order inside a form dialog: every control, wrapping at the ends.
    function focusables() {
      return Array.prototype.filter.call(
        box.querySelectorAll("input, select, textarea, .dlg-buttons button"),
        function (x) { return !x.disabled && x.offsetParent !== null; });
    }

    function onKey(e) {
      var i = btns.indexOf(document.activeElement);
      var t = document.activeElement;
      if (form && e.key === "Tab") {
        var all = focusables(), at = all.indexOf(t);
        all[(at + (e.shiftKey ? -1 : 1) + all.length) % all.length].focus();
      } else if (form && i === -1 && e.key !== "Escape") {
        // Typing in the form: only Enter in a one-line field presses the default button.
        if (e.key !== "Enter" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
        finish(o.defaultId || 0);
      } else if (e.key === "Escape") finish(cancelId);
      else if (e.key === "Tab" || e.key === "ArrowRight" || e.key === "ArrowLeft") {
        var dir = e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey) ? -1 : 1;
        btns[(i + dir + btns.length) % btns.length].focus();
      } else if (e.key === "Enter") finish(i === -1 ? o.defaultId || 0 : i);
      else if (e.key !== " ") return; // let Space click the focused button
      else if (i !== -1) return;
      e.preventDefault();
      e.stopPropagation();
    }
    document.addEventListener("keydown", onKey, true);

    if (form && focusables()[0]) focusables()[0].focus();
    else (btns[o.defaultId] || btns[0]).focus();

    current = { finish: finish };
    function finish(i) {
      if (!current) return;
      current = null;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      document.body.classList.remove("modal");
      if (restoreFocus && restoreFocus.focus) restoreFocus.focus();
      job.resolve(i);
      next();
    }
  }

  window.Dialog = {
    show: show,
    isOpen: function () { return !!current; }
  };

  api.onMenu(function (action, payload) {
    if (action !== "dialog") return;
    show(payload).then(function (i) { api.dialogResult(payload.id, i); });
  });
})();
