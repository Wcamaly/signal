# Security

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private reporting —
**Security → Report a vulnerability** on
<https://github.com/Wcamaly/signal/security/advisories/new> — or email the
maintainer. Expect a first reply within a week.

## What Signal handles

Signal stores API keys and channel tokens that you paste into the UI. They are
encrypted with AES-256-GCM before being written to SQLite and are never sent
back to the browser: the interface only ever shows the last four characters.

The encryption key comes from `SIGNAL_SECRET_KEY`. When that variable is unset,
a random key is generated once and written to `data/.signal-key` with mode
`0600`. That is convenient for a laptop and wrong for a shared host: set
`SIGNAL_SECRET_KEY` in any deployment where someone else can read the data
directory, or where the database may be restored on another machine.

## What Signal does not do

**There is no authentication.** Anyone who can reach the port can read your
drafts, your prompts and your source list, and can spend your API credits.
Signal is built to run on localhost, a homelab, or behind something that does
authenticate — a VPN, Tailscale, an authenticating reverse proxy. Do not put it
on a public IP as it is.

`GET /api/cron` is the one endpoint that can be triggered without the UI. Set
`CRON_SECRET` and it requires a bearer token; leave it empty and it runs the
pipeline for anyone who asks.

## Scope

In scope: credential handling, the publisher adapters, prompt or template
injection that leads to code execution or credential disclosure, and anything
that lets a malicious source item escape being treated as data.

Out of scope: the missing authentication layer described above (it is a
documented design decision), and vulnerabilities in the sources you configure.
