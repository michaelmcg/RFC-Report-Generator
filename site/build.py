"""Builds index.html, the homepage, as a plain-text RFC memo 72 columns wide.

Edit the text below, then run:  python site/build.py
"""
import html, os, re, sys

W = 72
REPO = "https://github.com/michaelmcg/RFC-Report-Generator"
DL = REPO + "/releases/latest/download/"
links = {
    "INSTALLER": (DL + "RFC-Report-Generator-Setup.exe", "RFC-Report-Generator-Setup.exe"),
    "PORTABLE": (DL + "RFC-Report-Generator-Portable.exe", "RFC-Report-Generator-Portable.exe"),
    "RELEASES": (REPO + "/releases", "github.com/michaelmcg/RFC-Report-Generator/releases"),
    "SOURCE": (REPO, "github.com/michaelmcg/RFC-Report-Generator"),
    "GITHUB": ("https://github.com/michaelmcg", "github.com/michaelmcg"),
    "LICENSE": (REPO + "/blob/main/LICENSE", "MIT License"),
    "RFC7322": ("https://www.rfc-editor.org/rfc/rfc7322", "RFC 7322"),
    "HOME": ("https://rfc.blame-dns.dev", "rfc.blame-dns.dev"),
}
TOKEN = re.compile(r"\{\{(\w+)\}\}")


def L(k):
    return "{{" + k + "}}"


def plain(s):
    return TOKEN.sub(lambda m: links[m.group(1)][1] if m.group(1) in links else "", s)


def two(a, b):
    return a + " " * (W - len(plain(a)) - len(plain(b))) + b


def wrap(text, first="   ", rest="   "):
    out, line = [], None
    for w in text.split():
        if line is None:
            line = first + w
        elif len(plain(line + " " + w)) <= W:
            line += " " + w
        else:
            out.append(line)
            line = rest + w
    out.append(line)
    return out


def leaders(rows):
    lw = max(len(a) for a, _ in rows) + 5
    return ["   " + a + " " + "." * max(3, lw - len(a) - 2) + " " + b for a, b in rows]


def sec(h, lines):
    return ["", "", h, ""] + lines


title = "RFC Report Generator"
pad = " " * ((W - len(title)) // 2)
doc = [
    two("Blame DNS", "michaelmcg"),
    two("Report: RFC-0001", L("HOME")),
    two("Category: Informational", "September 2026"),
    "Status: Final",
    "",
    "",
    pad + title,
    pad + "=" * len(title),
]

doc += sec("ABSTRACT", wrap(
    "RFC Report Generator is a free Windows app for writing incident and change reports "
    "as plain text, 72 columns wide, in the style of an IETF RFC. You fill in a form; it "
    "lays out the report as you type. It was probably DNS."))

doc += sec("STATUS OF THIS MEMO", wrap(
    "This memo describes version 1.1.0. It is final, and distribution is unlimited."))

doc += sec("1. DOWNLOAD",
    leaders([("Installer", L("INSTALLER")), ("Portable", L("PORTABLE")), ("Older versions", "See [RELEASES] below")])
    + [""]
    + wrap("The installer adds a Start menu entry and opens .rfcreport files when you "
           "double-click them. The portable version runs from anywhere, with nothing to install.")
    + [""]
    + wrap("The app is not code-signed yet, so Windows SmartScreen may warn on first run. "
           "Choose More info, then Run anyway."))

doc += sec("2. WHAT IT LOOKS LIKE", ["{{FIGURE}}"])

feats = [
    "A live preview beside the form, with a column ruler and a warning for any line over 72 characters.",
    "Header, abstract, summary, environment, timeline, impact, root cause, resolution, action items, "
    "security considerations, references and the author's address.",
    "Untick any section to leave it out. The rest renumber themselves.",
    "Sections for each category. A Change report starts with an implementation plan, testing, "
    "a rollback plan and approvals. An Upgrade report adds a table of versions.",
    "Commands and config are kept exactly as typed, never wrapped.",
    "Settings that prefill every new report: team, organization, author, time zone, your own Status "
    "choices, and the sections for each category.",
    "Spell check, with suggestions on right-click.",
    "Crash recovery: unsaved changes are kept, and offered back the next time the app starts.",
    "The last eight reports at the bottom of the File menu.",
    "Export as .txt or .html, or copy the text straight into an email or ticket.",
    "Reports save as .rfcreport files: plain JSON that diffs cleanly in Git.",
    "A Windows 95 look, in light and dark themes.",
]
fl = []
for f in feats:
    fl += wrap(f, "   - ", "     ")
doc += sec("3. FEATURES", fl)

doc += sec("4. REQUIREMENTS", leaders([
    ("System", "Windows 10 or 11, 64-bit"),
    ("Network", "None. Reports stay on your PC."),
]))

doc += sec("5. SECURITY CONSIDERATIONS", wrap(
    "The app makes no network requests. Its window runs sandboxed under a strict content "
    "security policy, and only a small, checked bridge can reach your files. Reports go only "
    "where you save or export them."))

refs = [
    ("[SOURCE]", L("SOURCE")),
    ("[RELEASES]", L("RELEASES")),
    ("[LICENSE]", L("LICENSE") + ", free to use and change"),
    ("[RFC7322]", L("RFC7322") + ", the RFC Style Guide"),
]
doc += sec("6. REFERENCES", ["   " + t.ljust(13) + v for t, v in refs])

doc += sec("AUTHOR", ["   michaelmcg", "   " + L("HOME"), "   " + L("GITHUB")])

doc += ["", "", two("Informational", "[Page 1]")]

bad = [plain(l) for l in doc if len(plain(l)) > W]
if bad:
    sys.exit("Over 72 columns:\n" + "\n".join(bad))

ruler_t = "".join(str(i // 10) if i % 10 == 0 else " " for i in range(1, W + 1))
ruler_o = "".join(str(i % 10) for i in range(1, W + 1))


def render(l):
    if l == "{{FIGURE}}":
        return l
    s = html.escape(l, quote=False)
    return TOKEN.sub(lambda m: '<a href="%s">%s</a>' % (html.escape(links[m.group(1)][0]), html.escape(links[m.group(1)][1])), s)


text = "\n".join(render(l) for l in doc)
before, after = text.split("\n{{FIGURE}}\n")

page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RFC Report Generator</title>
<meta name="description" content="A free Windows app for writing incident and change reports as plain text, 72 columns wide, in the style of an IETF RFC.">
<meta property="og:title" content="RFC Report Generator">
<meta property="og:description" content="Incident and change reports as plain text, 72 columns wide. It was probably DNS.">
<meta property="og:image" content="https://rfc.blame-dns.dev/screenshot.png">
<meta property="og:url" content="https://rfc.blame-dns.dev/">
<link rel="icon" href="icon-32.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&amp;display=swap">
<link rel="stylesheet" href="style.css">
</head>
<body>
<!-- Generated by site/build.py. Edit that, then run: python site/build.py -->
<main class="memo">
<pre class="ruler" aria-hidden="true">{ruler_t}
{ruler_o}</pre>
<pre>{before}</pre>
<figure>
  <img src="screenshot.png" width="1402" height="902" alt="RFC Report Generator: the report form on the left and the 72-column plain-text preview on the right, in a Windows 95 style window.">
  <figcaption>Figure 1: The app with the example report loaded.</figcaption>
</figure>
<pre>{after}</pre>
</main>
</body>
</html>
"""
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html")
open(out, "w", encoding="utf8", newline="").write(page)
print("\n".join(plain(l) for l in doc))
