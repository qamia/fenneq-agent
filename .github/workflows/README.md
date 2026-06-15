# CI on this fork — intentionally none

`qamia/fenneq-agent` is the **FenneQ agent** (a Cline fork), consumed by Qortex as a
**built-in extension**. It is **not** published or tested on its own: the VSIX is
built and packaged by the **`qortex-build`** workflow in `qamia/qortex-shell`, which
extracts the agent into the shell's `resources/app/extensions/`.

So this fork needs **no** GitHub Actions of its own. The ~10 workflows inherited
from upstream Cline were **removed** (QAM-516) because on a public fork they are
either dangerous, wasteful, or wrong for us:

- `ext-jb-test-integration.yml` — used **`pull_request_target`** (elevated token on
  untrusted PR code — a real security risk on a public repo).
- `cli-publish.yml`, `sdk-publish.yml`, `repo-stale-issues.yml` — **scheduled** (cron)
  jobs that would publish packages / close issues unattended.
- `ext-vscode-publish-nightly.yml`, `ext-vscode-publish-stable.yml` — publish to the
  VS Code Marketplace / Open VSX under Cline's identity using `VSCE_PAT` / `OVSX_PAT`.
- `ext-vscode-test*.yml`, `sdk-test.yml` — run on every push/PR; wasted minutes.
- `repo-label-issues.yml` — Cline's issue triage automation.

> If you ever need CI here, add a single workflow guarded with
> `if: github.repository == 'qamia/fenneq-agent'` so it never runs on downstream forks.

## VSIX packaging note (`--allow-package-secrets sendgrid`)

When packaging the agent VSIX, the build uses
`vsce package --allow-package-secrets sendgrid`. This is an **inherited Cline
scanner exception**: `vsce`'s secret scanner false-positives on a SendGrid-shaped
string in upstream Cline sources. The flag suppresses that one rule — it does **not**
ship a real secret. Re-confirm (grep the packed VSIX) if upstream changes that code.
