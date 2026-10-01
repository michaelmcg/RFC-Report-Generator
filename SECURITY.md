# Security policy

## Report a vulnerability

Do not open a public issue for a security problem.

Report it privately on GitHub instead:

1. Open the [Security tab](https://github.com/michaelmcg/RFC-Report-Generator/security).
2. Choose **Report a vulnerability**.
3. Describe the problem, the steps to reproduce it, and the app version
   (Help > About shows it).

You will get a reply within 7 days.

## Supported versions

Only the [latest release](https://github.com/michaelmcg/RFC-Report-Generator/releases/latest)
gets security fixes.

## Scope

RFC Report Generator makes no network requests. Its page runs sandboxed under a
strict content security policy, and only a small, checked bridge in
`preload.js` can reach your files. A report that escapes the sandbox, reaches
files or commands it should not, or runs code from a `.rfcreport` file is in
scope.
