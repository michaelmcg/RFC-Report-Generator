/* Report model and plain-text formatter. No DOM access, so it can be tested in Node. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Report = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var W = 72;

  var LISTS = {
    env:      [["label", "Label", "1fr"], ["value", "Value", "2fr"]],
    timeline: [["time", "YYYY-MM-DD HH:MM", "1fr"], ["event", "Event", "2.5fr"]],
    impact:   [["label", "Label", "1fr"], ["value", "Value", "2fr"]],
    actions:  [["owner", "Owner", "1fr"], ["due", "Due", "0.8fr"], ["action", "Action", "2.5fr"]],
    refs:     [["tag", "TAG", "0.6fr"], ["text", "Reference", "2.5fr"]],
    versions: [["component", "Component", "1.4fr"], ["from", "From", "1fr"], ["to", "To", "1fr"]],
    approvals: [["name", "Name", "1.2fr"], ["role", "Role", "1.2fr"], ["date", "Date", "0.8fr"]]
  };

  // Every section that can be ticked, in report order. Each has a sec_<id> flag.
  var SECTIONS = ["abstract", "memo", "summary", "env", "versions", "timeline", "impact", "plan",
    "root", "resolution", "validation", "rollback", "actions", "approvals", "security", "refs", "addr"];

  var CATEGORIES = ["Incident", "Change", "Upgrade", "Implementation", "Informational"];

  // The sections each category starts with. Edit > Settings can change them.
  var TEMPLATES = {
    Incident: ["abstract", "memo", "summary", "env", "timeline", "impact", "root", "resolution",
      "actions", "security", "refs", "addr"],
    Change: ["abstract", "memo", "summary", "env", "timeline", "impact", "plan", "validation",
      "rollback", "actions", "approvals", "security", "refs", "addr"],
    Upgrade: ["abstract", "memo", "summary", "env", "versions", "timeline", "impact", "plan",
      "validation", "rollback", "actions", "approvals", "security", "refs", "addr"],
    Implementation: ["abstract", "memo", "summary", "env", "timeline", "plan", "validation",
      "actions", "approvals", "refs", "addr"],
    Informational: ["abstract", "memo", "summary", "env", "refs", "addr"]
  };

  function today() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  // The ticks here are the Incident template, and every section added later defaults to
  // unticked, so older files open looking as they did.
  function defaults() {
    return {
      f: {
        team: "", author: "", rid: "", org: "", category: "Incident", date: today(),
        status: "Draft", title: "", abstract: "", memo: "",
        sec_abstract: true, sec_memo: true, sec_addr: true,
        sec_summary: true, sec_env: true, sec_timeline: true, sec_impact: true,
        sec_root: true, sec_resolution: true, sec_actions: true, sec_security: true, sec_refs: true,
        sec_versions: false, sec_plan: false, sec_validation: false, sec_rollback: false, sec_approvals: false,
        summary: "", tz: "", root: "", factors: "", resolution: "", commands: "", security: "",
        plan: "", validation: "", rollback: "",
        a_name: "", a_title: "", a_org: "", a_email: ""
      },
      lists: {
        env: ["Client", "Application", "Servers", "Database", "Environment"].map(function (l) { return { label: l, value: "" }; }),
        timeline: [{ time: "", event: "" }],
        impact: ["Users affected", "Duration", "Data loss", "Workaround used"].map(function (l) { return { label: l, value: "" }; }),
        actions: [{ owner: "", due: "", action: "" }],
        refs: [{ tag: "TICKET", text: "" }],
        versions: [{ component: "", from: "", to: "" }],
        approvals: [{ name: "", role: "", date: "" }]
      }
    };
  }

  function example() {
    var s = defaults();
    Object.assign(s.f, {
      team: "Professional Services", author: "J. Admin", rid: "INC-1983",
      org: "Example Health", category: "Incident", status: "Final",
      title: "Application Outage After AG Failover",
      abstract: "Application servers could not reconnect to the database for 47 minutes after a planned availability group failover. The listener DNS record was stale. It was DNS.",
      memo: "This memo is final and is distributed to the project team and client IT leadership.",
      summary: "During a planned patching window the availability group failed over to the secondary node as expected. The database came online within seconds, but application servers kept connecting to the old node's IP address. Users could not log in until client DNS caches expired. Service is fully restored.",
      tz: "Central",
      root: "The availability group listener was created with RegisterAllProvidersIP set to 0 and the default HostRecordTTL of 1200 seconds. After failover, the listener's DNS record was updated, but clients kept using the cached address for up to 20 minutes, and one application server had a static hosts file entry that never expired.",
      factors: "The hosts file entry was added during go-live testing and never removed.\nNo alert fired, because the database itself reported healthy.",
      resolution: "The stale hosts file entry was removed and DNS caches were flushed on all application servers. The listener TTL was lowered so future failovers resolve quickly.",
      commands: "Get-ClusterResource \"AG1_Listener\" |\n    Set-ClusterParameter HostRecordTTL 300\nipconfig /flushdns",
      security: "",
      a_name: "J. Admin", a_title: "Technical Consultant", a_org: "Example Health", a_email: "j.admin@example.com"
    });
    s.lists.env = [
      { label: "Client", value: "Example Health" },
      { label: "Application", value: "Example App 2026.1" },
      { label: "Servers", value: "APP01, APP02" },
      { label: "Database", value: "SQLAG1 (listener AG1-LSN)" },
      { label: "Environment", value: "Production" }
    ];
    s.lists.timeline = [
      { time: "2026-09-26 22:00", event: "Planned failover started." },
      { time: "2026-09-26 22:01", event: "Secondary node online as primary." },
      { time: "2026-09-26 22:04", event: "Users report login failures." },
      { time: "2026-09-26 22:30", event: "Everyone agrees it is not DNS." },
      { time: "2026-09-26 22:41", event: "nslookup shows the old IP. It is DNS." },
      { time: "2026-09-26 22:48", event: "Hosts entry removed, caches flushed. Service restored." }
    ];
    s.lists.impact = [
      { label: "Users affected", value: "All application users" },
      { label: "Duration", value: "47 minutes" },
      { label: "Data loss", value: "None" },
      { label: "Workaround used", value: "None" }
    ];
    s.lists.actions = [
      { owner: "Client DBA", due: "2026-10-09", action: "Set HostRecordTTL to 300 on all AG listeners." },
      { owner: "Client IT", due: "2026-10-09", action: "Audit hosts files on application servers and remove test entries." },
      { owner: "J. Admin", due: "2026-10-16", action: "Add a post-failover name resolution check to the patching runbook." }
    ];
    s.lists.refs = [
      { tag: "TICKET", text: "INC-1983" },
      { tag: "CHANGE", text: "CHG-0042, monthly patching" },
      { tag: "DNS", text: "It was DNS." }
    ];
    return s;
  }

  // Fields that Edit > Settings can prefill in every new report.
  var PREFILL = ["team", "author", "org", "category", "tz", "memo", "a_name", "a_title", "a_org", "a_email"];

  // Settings keeps each category's sections as text, e.g. tpl_change: "summary,env,plan".
  function templateKey(category) { return "tpl_" + String(category).toLowerCase(); }

  function templates(prefill) {
    var out = {};
    CATEGORIES.forEach(function (c) {
      var saved = prefill && prefill[templateKey(c)];
      out[c] = typeof saved === "string"
        ? saved.split(",").map(flat).filter(function (id) { return SECTIONS.indexOf(id) !== -1; })
        : TEMPLATES[c].slice();
    });
    return out;
  }

  // Tick exactly the sections in the list. Unticked sections keep their text.
  function applyTemplate(f, sections) {
    SECTIONS.forEach(function (id) { f["sec_" + id] = sections.indexOf(id) !== -1; });
    return f;
  }

  var STATUSES = ["Draft", "Final"];

  // The Status choices: Edit > Settings keeps them as text, one per line.
  function statusList(prefill) {
    var seen = {};
    var list = String((prefill && prefill.statuses) || "").split("\n").map(flat).filter(function (x) {
      var k = x.toLowerCase();
      if (!x || seen[k]) return false;
      seen[k] = true;
      return true;
    });
    return list.length ? list : STATUSES.slice();
  }

  // A new report: the defaults, with the saved prefill laid over them.
  // Only known keys are taken, and only when the type matches the default.
  // The first Status choice is the default status, and the category's template ticks the sections.
  function fresh(prefill) {
    var s = defaults();
    prefill = prefill || {};
    PREFILL.forEach(function (k) {
      if (typeof prefill[k] === typeof s.f[k]) s.f[k] = prefill[k];
    });
    if (CATEGORIES.indexOf(s.f.category) === -1) s.f.category = "Incident";
    s.f.status = statusList(prefill)[0];
    applyTemplate(s.f, templates(prefill)[s.f.category]);
    return s;
  }

  // Fill in anything missing from an older or hand-edited file.
  function normalize(s) {
    var d = defaults();
    s = s || {};
    var out = { f: Object.assign({}, d.f, s.f || {}), lists: {} };
    Object.keys(LISTS).forEach(function (k) {
      var rows = s.lists && Array.isArray(s.lists[k]) ? s.lists[k] : d.lists[k];
      out.lists[k] = rows.map(function (r) {
        var o = {};
        LISTS[k].forEach(function (c) { o[c[0]] = r && r[c[0]] != null ? String(r[c[0]]) : ""; });
        return o;
      });
    });
    return out;
  }

  // ---------- formatting helpers ----------

  function flat(v) { return String(v || "").replace(/\s+/g, " ").trim(); }

  function wrap(text, first, rest) {
    var out = [];
    var paras = String(text || "").replace(/\r/g, "").split(/\n\s*\n/);
    paras.forEach(function (p) {
      var words = p.split(/\s+/).filter(Boolean);
      if (!words.length) return;
      if (out.length) out.push("");
      var line = null, ind = first;
      words.forEach(function (w) {
        if (line === null) line = ind + w;
        else if ((line + " " + w).length <= W) line += " " + w;
        else { out.push(line); ind = rest; line = rest + w; }
      });
      if (line !== null) out.push(line);
    });
    return out;
  }

  function body(text, fallback) {
    var t = String(text || "").trim() || fallback || "[TBD]";
    return wrap(t, "   ", "   ");
  }

  function hanging(prefix, text) {
    return wrap(flat(text) || "[TBD]", prefix, " ".repeat(prefix.length));
  }

  function maxLen(arr, min) {
    return arr.reduce(function (m, x) { return Math.max(m, x.length); }, min || 0);
  }

  function leaders(rows) {
    rows = rows.filter(function (r) { return flat(r.label) || flat(r.value); });
    if (!rows.length) return ["   [TBD]"];
    var lw = maxLen(rows.map(function (r) { return flat(r.label); })) + 5;
    var out = [];
    rows.forEach(function (r) {
      var label = flat(r.label);
      var pre = "   " + label + " " + ".".repeat(Math.max(3, lw - label.length - 2)) + " ";
      out = out.concat(hanging(pre, r.value));
    });
    return out;
  }

  function center(text) {
    var lines = wrap(flat(text) || "[Title]", "", "");
    var out = lines.map(function (l) {
      return " ".repeat(Math.max(0, Math.floor((W - l.length) / 2))) + l;
    });
    var widest = maxLen(lines);
    var last = lines[lines.length - 1];
    var ulen = lines.length > 1 ? Math.min(widest, W) : last.length;
    out.push(" ".repeat(Math.max(0, Math.floor((W - ulen) / 2))) + "=".repeat(ulen));
    return out;
  }

  // A table with a header and a dashed rule. The last column wraps under itself; the
  // others are as wide as their longest value (at least the header, or col.min).
  function table(cols, rows) {
    rows = rows.map(function (r) { return r.map(flat); });
    var fixed = cols.slice(0, -1);
    var widths = fixed.map(function (c, i) {
      return maxLen(rows.map(function (r) { return r[i]; }), Math.max(c.min || 0, c.head.length));
    });
    var start = 3 + widths.reduce(function (sum, w) { return sum + w + 2; }, 0);
    var out = [
      "   " + fixed.map(function (c, i) { return c.head.padEnd(widths[i]); }).join("  ") + "  " + cols[cols.length - 1].head,
      "   " + widths.map(function (w) { return "-".repeat(w); }).join("  ") + "  " + "-".repeat(Math.max(6, W - start))
    ];
    if (!rows.length) out.push("   [TBD]");
    rows.forEach(function (r) {
      var pre = "   " + widths.map(function (w, i) { return r[i].padEnd(w); }).join("  ") + "  ";
      out = out.concat(hanging(pre, r[r.length - 1]));
    });
    return out;
  }

  function twoCol(a, b) {
    a = flat(a); b = flat(b);
    if (!b) return a;
    return a + " ".repeat(Math.max(1, W - a.length - b.length)) + b;
  }

  // ---------- build ----------

  function build(state) {
    var s = normalize(state);
    var f = s.f, L = [], n = 0;

    function section(heading, lines) {
      L.push("", "", heading, "");
      L.push.apply(L, lines);
    }

    L.push(twoCol(f.team, f.author));
    L.push(twoCol("Report: " + (flat(f.rid) || "[TBD]"), f.org));
    L.push(twoCol("Category: " + f.category, f.date));
    L.push(twoCol("Status: " + f.status, ""));
    L.push("", "");
    L.push.apply(L, center(f.title));

    if (f.sec_abstract) section("ABSTRACT", body(f.abstract));
    if (f.sec_memo) section("STATUS OF THIS MEMO", body(f.memo));

    if (f.sec_summary) { n++; section(n + ". SUMMARY", body(f.summary)); }

    if (f.sec_env) { n++; section(n + ". ENVIRONMENT", leaders(s.lists.env)); }

    if (f.sec_versions) {
      n++;
      var vr = s.lists.versions.filter(function (r) { return flat(r.component) || flat(r.from) || flat(r.to); });
      section(n + ". VERSIONS", table(
        [{ head: "Component" }, { head: "From" }, { head: "To" }],
        vr.map(function (r) { return [r.component, r.from, r.to]; })));
    }

    if (f.sec_timeline) {
      n++;
      var tl = [];
      if (flat(f.tz)) tl.push("   All times " + flat(f.tz) + ".", "");
      var rows = s.lists.timeline.filter(function (r) { return flat(r.time) || flat(r.event); });
      if (!rows.length) tl.push("   [TBD]");
      var tw = maxLen(rows.map(function (r) { return flat(r.time); }), 4);
      rows.forEach(function (r) {
        tl = tl.concat(hanging("   " + flat(r.time).padEnd(tw) + "   ", r.event));
      });
      section(n + ". TIMELINE", tl);
    }

    if (f.sec_impact) { n++; section(n + ". IMPACT", leaders(s.lists.impact)); }

    if (f.sec_plan) { n++; section(n + ". IMPLEMENTATION PLAN", body(f.plan)); }

    if (f.sec_root) {
      n++;
      var rc = body(f.root);
      var factors = String(f.factors || "").split("\n").map(flat).filter(Boolean);
      if (factors.length) {
        rc.push("", "   " + n + ".1. Contributing Factors", "");
        factors.forEach(function (x) { rc = rc.concat(wrap(x, "      - ", "        ")); });
      }
      section(n + ". ROOT CAUSE", rc);
    }

    if (f.sec_resolution) {
      n++;
      var rs = body(f.resolution);
      var cmds = String(f.commands || "").replace(/\r/g, "").replace(/\t/g, "    ").split("\n");
      while (cmds.length && !cmds[cmds.length - 1].trim()) cmds.pop();
      while (cmds.length && !cmds[0].trim()) cmds.shift();
      if (cmds.length) {
        rs.push("");
        cmds.forEach(function (c) { rs.push(c.trim() ? "      " + c.replace(/\s+$/, "") : ""); });
      }
      section(n + ". RESOLUTION", rs);
    }

    if (f.sec_validation) { n++; section(n + ". TESTING AND VALIDATION", body(f.validation)); }

    if (f.sec_rollback) { n++; section(n + ". ROLLBACK PLAN", body(f.rollback)); }

    if (f.sec_actions) {
      n++;
      var ar = s.lists.actions.filter(function (r) { return flat(r.owner) || flat(r.due) || flat(r.action); });
      section(n + ". ACTION ITEMS", table(
        [{ head: "ID", min: 4 }, { head: "Owner" }, { head: "Due" }, { head: "Action" }],
        ar.map(function (r, i) { return ["A" + (i + 1), r.owner, r.due, r.action]; })));
    }

    if (f.sec_approvals) {
      n++;
      var ap = s.lists.approvals.filter(function (r) { return flat(r.name) || flat(r.role) || flat(r.date); });
      section(n + ". APPROVALS", table(
        [{ head: "Name" }, { head: "Role" }, { head: "Date" }],
        ap.map(function (r) { return [r.name, r.role, r.date]; })));
    }

    if (f.sec_security) { n++; section(n + ". SECURITY CONSIDERATIONS", body(f.security, "None identified.")); }

    if (f.sec_refs) {
      n++;
      var rr = s.lists.refs.filter(function (r) { return flat(r.tag) || flat(r.text); });
      var ref = [];
      if (!rr.length) ref.push("   [TBD]");
      var gw = maxLen(rr.map(function (r) { return "[" + (flat(r.tag) || "REF") + "]"; }), 4);
      rr.forEach(function (r) {
        var tag = "[" + (flat(r.tag).toUpperCase() || "REF") + "]";
        ref = ref.concat(hanging("   " + tag.padEnd(gw) + "   ", r.text));
      });
      section(n + ". REFERENCES", ref);
    }

    if (f.sec_addr) {
      var addr = [f.a_name, f.a_title, f.a_org, f.a_email].map(flat).filter(Boolean).map(function (x) { return "   " + x; });
      section("AUTHOR'S ADDRESS", addr.length ? addr : ["   [TBD]"]);
    }

    return L;
  }

  function escHtml(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function toText(lines) { return lines.join("\n") + "\n"; }

  function toHtml(lines, title) {
    return "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n" +
      "<title>" + escHtml(flat(title) || "Report") + "</title>\n</head>\n<body>\n<pre>\n" +
      escHtml(toText(lines)) + "</pre>\n</body>\n</html>\n";
  }

  function suggestedName(state) {
    var f = (state && state.f) || {};
    var base = flat(f.rid) || flat(f.title) || "report";
    return base.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-").slice(0, 80) || "report";
  }

  return {
    W: W, LISTS: LISTS, SECTIONS: SECTIONS, CATEGORIES: CATEGORIES, TEMPLATES: TEMPLATES,
    templates: templates, templateKey: templateKey, applyTemplate: applyTemplate, PREFILL: PREFILL, STATUSES: STATUSES, statusList: statusList, defaults: defaults, fresh: fresh, example: example, normalize: normalize,
    build: build, toText: toText, toHtml: toHtml, escHtml: escHtml, suggestedName: suggestedName
  };
});
