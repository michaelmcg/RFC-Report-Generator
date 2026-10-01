"use strict";
// Run with: npm test
const assert = require("node:assert/strict");
const R = require("../src/report.js");

let failures = 0;
function test(name, fn) {
  try { fn(); console.log("ok   " + name); }
  catch (e) { failures++; console.log("FAIL " + name + "\n     " + e.message); }
}

const ex = R.build(R.example());

test("example: no line over 72 columns", () => {
  assert.deepEqual(ex.filter((l) => l.length > R.W), []);
});

test("header right column ends at column 72", () => {
  for (const l of ex.slice(0, 3)) assert.equal(l.length, R.W, JSON.stringify(l));
});

test("sections are numbered in order", () => {
  const nums = ex.filter((l) => /^\d+\. [A-Z]/.test(l)).map((l) => parseInt(l, 10));
  assert.deepEqual(nums, nums.map((_, i) => i + 1));
});

test("unticking a section renumbers the rest", () => {
  const s = R.example();
  s.f.sec_env = false;
  const heads = R.build(s).filter((l) => /^\d+\. [A-Z]/.test(l));
  assert.equal(heads[1], "2. TIMELINE");
});

test("dot leaders line up values", () => {
  const i = ex.indexOf("2. ENVIRONMENT");
  const rows = ex.slice(i + 2, i + 7);
  const cols = rows.map((l) => { const m = / \.{3,} /.exec(l); return m.index + m[0].length; });
  assert.equal(new Set(cols).size, 1, rows.join("\n"));
});

test("empty report builds with placeholders", () => {
  const out = R.build(R.defaults());
  assert.ok(out.some((l) => l.includes("[TBD]")));
  assert.ok(out.includes("   None identified."));
});

test("normalize tolerates missing fields", () => {
  const out = R.build({ f: { title: "Only a title" } });
  assert.ok(out.some((l) => l.trim() === "Only a title"));
});

test("unticking abstract, memo and address leaves them out", () => {
  const s = R.example();
  s.f.sec_abstract = s.f.sec_memo = s.f.sec_addr = false;
  const out = R.build(s);
  for (const h of ["ABSTRACT", "STATUS OF THIS MEMO", "AUTHOR'S ADDRESS"]) assert.ok(!out.includes(h), h);
  assert.ok(out.includes("1. SUMMARY"));
});

test("fresh() applies known prefill keys of the right type only", () => {
  const s = R.fresh({ team: "Pro Services", sec_refs: false, rid: "INC-9", tz: 5, bogus: "x" });
  assert.equal(s.f.team, "Pro Services");
  assert.equal(s.f.sec_refs, true);  // sections come from the template, not sec_* keys
  assert.equal(s.f.rid, "");         // not a prefill field
  assert.equal(s.f.tz, "");          // wrong type
  assert.ok(!("bogus" in s.f));
  assert.equal(s.f.date, R.defaults().f.date);
});

const HEADS = (out) => out.filter((l) => /^\d+\. [A-Z]/.test(l)).map((l) => l.replace(/^\d+\. /, ""));

test("defaults() ticks exactly the Incident template", () => {
  const d = R.defaults().f;
  for (const id of R.SECTIONS) assert.equal(d["sec_" + id], R.TEMPLATES.Incident.includes(id), id);
});

test("an older file opens without the new sections", () => {
  const old = R.example();
  for (const k of ["sec_versions", "sec_plan", "sec_validation", "sec_rollback", "sec_approvals"]) delete old.f[k];
  delete old.lists.versions;
  delete old.lists.approvals;
  const heads = HEADS(R.build(old));
  for (const h of ["VERSIONS", "IMPLEMENTATION PLAN", "TESTING AND VALIDATION", "ROLLBACK PLAN", "APPROVALS"]) {
    assert.ok(!heads.includes(h), h);
  }
});

test("each category's template picks its sections, in report order", () => {
  const change = HEADS(R.build(R.fresh({ category: "Change" })));
  assert.deepEqual(change, ["SUMMARY", "ENVIRONMENT", "TIMELINE", "IMPACT", "IMPLEMENTATION PLAN",
    "TESTING AND VALIDATION", "ROLLBACK PLAN", "ACTION ITEMS", "APPROVALS", "SECURITY CONSIDERATIONS", "REFERENCES"]);
  assert.ok(HEADS(R.build(R.fresh({ category: "Upgrade" }))).includes("VERSIONS"));
  assert.deepEqual(HEADS(R.build(R.fresh({ category: "Informational" }))), ["SUMMARY", "ENVIRONMENT", "REFERENCES"]);
  assert.equal(R.fresh({ category: "Bogus" }).f.category, "Incident");
});

test("saved templates override the built-in ones", () => {
  const p = { category: "Change", [R.templateKey("Change")]: "summary, plan ,nonsense" };
  assert.deepEqual(R.templates(p).Change, ["summary", "plan"]);
  assert.deepEqual(HEADS(R.build(R.fresh(p))), ["SUMMARY", "IMPLEMENTATION PLAN"]);
  assert.deepEqual(R.templates({ tpl_informational: "" }).Informational, []);
});

test("versions and approvals render as tables within 72 columns", () => {
  const s = R.fresh({ category: "Upgrade" });
  s.lists.versions = [{ component: "Example App", from: "2025.4", to: "2026.1" }];
  s.lists.approvals = [{ name: "J. Admin", role: "Change manager", date: "2026-09-28" }];
  const out = R.build(s);
  assert.ok(out.includes("   Component    From    To"), out.join("\n"));
  assert.ok(out.includes("   Example App  2025.4  2026.1"));
  assert.ok(out.includes("   J. Admin  Change manager  2026-09-28"));
  assert.deepEqual(out.filter((l) => l.length > R.W), []);
});

test("statusList trims, drops blanks and duplicates, falls back to defaults", () => {
  assert.deepEqual(R.statusList({ statuses: " Pending \n\nDraft\npending\nFinal " }), ["Pending", "Draft", "Final"]);
  assert.deepEqual(R.statusList({ statuses: "  \n" }), ["Draft", "Final"]);
  assert.deepEqual(R.statusList(null), ["Draft", "Final"]);
});

test("fresh() starts on the first status choice", () => {
  assert.equal(R.fresh({ statuses: "Pending\nFinal" }).f.status, "Pending");
  assert.equal(R.fresh({}).f.status, "Draft");
});

if (process.argv.includes("--print")) console.log("\n" + R.toText(ex));
process.exit(failures ? 1 : 0);
