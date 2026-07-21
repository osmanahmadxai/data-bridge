# Security Policy

## Supported versions

Syncle is pre-1.0 and moves fast; security fixes land on `main` and the
latest release only.

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |
| older   | ❌        |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Email **osmanahmadxai@gmail.com** with:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept helps), and
- any suggested fix you have in mind.

You'll get an acknowledgement within a few days. Once a fix is ready I'll
coordinate disclosure timing with you and credit you in the release notes unless
you'd rather stay anonymous.

## Scope notes

Syncle is built to run on a trusted network. A few things are deliberately
out of scope unless you've deployed it differently:

- **No built-in auth layer.** The app assumes you put it behind your own
  authentication / network controls before exposing it.
- **Outbound webhook URLs are user-controlled.** Restrict destinations at your
  network edge if you run this somewhere multi-tenant.

Things that *are* in scope and that I care about: credential handling (secrets
are encrypted at rest with AES-256-GCM), SQL/command injection through the
adapters, and payload-template injection.
