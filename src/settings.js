/* Edit > Settings: values that prefill every new report. Shown in a Win95 dialog (src/dialog.js).
   Settings.open(prefill) resolves with the new prefill object, or null if cancelled. */
(function () {
  "use strict";

  var R = window.Report;
  var form = document.getElementById("form");

  function build(prefill) {
    var d = R.fresh(prefill).f;
    var root = document.getElementById("settingsTpl").content.firstElementChild.cloneNode(true);

    // Category choices and section names come from the report form, so they can't drift.
    var cat = root.querySelector('[data-p="category"]');
    Array.prototype.forEach.call(form.querySelector('[data-f="category"]').options, function (o) {
      cat.appendChild(o.cloneNode(true));
    });

    // Sections by category: one row per section, one column per category.
    var tpl = R.templates(prefill);
    var grid = root.querySelector("[data-templates]");
    var head = grid.createTHead().insertRow();
    head.appendChild(document.createElement("th"));
    R.CATEGORIES.forEach(function (c) {
      var th = document.createElement("th");
      th.scope = "col";
      th.textContent = c;
      head.appendChild(th);
    });
    var body = grid.createTBody();
    R.SECTIONS.forEach(function (id) {
      var src = form.querySelector('[data-f="sec_' + id + '"]');
      var name = src ? src.parentElement.textContent.trim() : id;
      var row = body.insertRow();
      var th = document.createElement("th");
      th.scope = "row";
      th.textContent = name;
      row.appendChild(th);
      R.CATEGORIES.forEach(function (c) {
        var box = document.createElement("input");
        box.type = "checkbox";
        box.dataset.cat = c;
        box.dataset.sec = id;
        box.checked = tpl[c].indexOf(id) !== -1;
        box.setAttribute("aria-label", name + " in " + c + " reports");
        row.insertCell().appendChild(box);
      });
    });

    d.statuses = R.statusList(prefill).join("\n");
    root.querySelectorAll("[data-p]").forEach(function (el) {
      var v = d[el.dataset.p];
      if (el.type === "checkbox") el.checked = !!v; else el.value = v == null ? "" : v;
    });
    return root;
  }

  function read(root) {
    var p = {};
    root.querySelectorAll("[data-p]").forEach(function (el) {
      p[el.dataset.p] = el.type === "checkbox" ? el.checked : el.value;
    });
    R.CATEGORIES.forEach(function (c) {
      p[R.templateKey(c)] = R.SECTIONS.filter(function (id) {
        return root.querySelector('[data-cat="' + c + '"][data-sec="' + id + '"]').checked;
      }).join(",");
    });
    return p;
  }

  function open(prefill) {
    var root = build(prefill);
    return window.Dialog.show({
      title: "Settings",
      content: root,
      buttons: ["OK", "Cancel"],
      defaultId: 0,
      cancelId: 1
    }).then(function (i) { return i === 0 ? read(root) : null; });
  }

  window.Settings = { open: open };
})();
