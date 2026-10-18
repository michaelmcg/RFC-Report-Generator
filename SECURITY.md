# Security policy

## Report a vulnerability

Do not open a public issue for a security problem.

[Report it privately on GitHub](https://github.com/michaelmcg/RFC-Report-Generator/security/advisories/new).
Describe the problem, the steps to reproduce it, and the app version
(Help > About shows it).

You will get a reply within 7 days.

## Supported versions

Only the [latest release](https://github.com/michaelmcg/RFC-Report-Generator/releases/latest)
gets security fixes.

## Scope

RFC Report Generator makes no network requests of its own. The one exception
is spell checking on Linux, where Chromium downloads a dictionary from Google
the first time the app runs. Windows and macOS use the system spell checker.

The page runs sandboxed under a strict content security policy. It reaches
your files only through the bridge in `preload.js`, and the main process
checks every call: it accepts calls only from the app's own window, and it
writes or shows only files you picked in a dialog or opened yourself.

A report that escapes the sandbox, reaches files or commands it should not, or
runs code from a `.rfcreport` file is in scope.

### Out of scope

- Windows SmartScreen warnings. The release exes are signed, but a new
  release can still warn until it builds a reputation.
- Attacks that need local admin rights, or a modified install or app data
  folder.
- Bugs in Electron or Chromium themselves. Report those upstream. Tell us if
  the app needs an Electron update to get the fix.
