# Repository guidance for Claude

## Repository purpose

This repository contains a Google Apps Script automation for the OUAS Flypro
weekly process. The main runtime file is `flypro-script.gs` and the operational
documentation is `README.md`.

The script reads a Google Spreadsheet week tab, validates the entries, creates
Flypro and MT PDFs, creates or sends three Gmail messages, maintains the
`FLYPRO` summary tab, locks the completed week, creates the next template tab,
and hides the completed week on Sunday.

## Scheduled workflow

- Thursday 17:00: `thursdayRun` validates and publishes the week.
- Sunday 23:00: `sundayRun` hides the previous week and rebuilds the
  `FLYPRO` summary with the upcoming week.

`setUpTriggers()` creates the Thursday and Sunday triggers, removes the legacy
Friday trigger, and should be run once after
deployment. Trigger times use the Apps Script project timezone; date formatting
uses `CONFIG.TIMEZONE`.

The standalone entry points `flyproRun`, `mtRun`, and `accomRun` create only
their named output for the next Monday. They are intended for selective manual
runs or resends and must not lock the week, roll the template, or alter the
Sunday cleanup properties.

## Important safety behavior

- Keep `CONFIG.TEST_MODE` set to `true` while testing.
- Keep `CONFIG.SEND_MODE` set to `DRAFT` until drafts have been reviewed.
- Pre-flight failures must stop the Thursday process before PDFs, normal emails,
  locking, or template roll-forward occur.
- Failure alerts are sent directly to `CONFIG.ERROR_TO`, even when normal
  delivery is in test/draft mode.
- Do not remove or bypass validation, failure alerts, or the test safeguards
  without explicit user approval.
- Generated PDFs are shared as anyone-with-the-link viewable; preserve this
  behavior unless the sharing requirement changes.
- Completed week tabs are hidden rather than copied or deleted so they remain
  recoverable in the active spreadsheet.

## Configuration rules

Keep recipient addresses, subject formats, signature settings, and Drive IDs in
the `CONFIG` object. The current signature behavior is:

1. Use `CONFIG.SIGNATURE_HTML` if it is populated.
2. Otherwise, use the Gmail send-as identity matching
   `CONFIG.GMAIL_SIGNATURE_SEND_AS`.

The Gmail API does not expose Gmail's separate signature UI names; it exposes
signature HTML on send-as identities. When `GMAIL_SIGNATURE_SEND_AS` is blank,
use the default send-as identity, then the primary identity. The Gmail advanced
service is required for send-as signature lookup.

## Spreadsheet assumptions

Week tabs are named like `WC 10th August` and use the upgraded three-column
per-day layout. The layout constants are defined in `L`; update that block if
the spreadsheet structure changes.

The script reads availability, duty overrides, flying bids, MT requests, and
accommodation details from fixed row ranges. Do not change those ranges without
updating the parser, validation, document generation, and README documentation.

After Thursday and Sunday runs, sheet ordering is maintained as TN template,
Flypro template, `FLYPRO`, unlocked `WC` tabs from furthest to soonest, locked
`WC` tabs, then unrelated tabs.

## Change guidelines

- Preserve existing user changes and avoid destructive operations unless the
  user explicitly requests them.
- Keep the Apps Script code compatible with Google Apps Script V8.
- Prefer small, focused changes.
- After code changes, run a syntax check where possible and inspect the changed
  workflow paths.
- Do not add test-data seeding or preview scaffolding back into the production
  script unless explicitly requested.
- Whenever behavior, configuration, setup, spreadsheet layout, scheduling,
  email content, or troubleshooting changes, update `README.md` in the same
  change.
- Keep `README.md` accurate and written for the person operating the automation,
  not just for a developer.

## Files

- `flypro-script.gs`: production Google Apps Script source.
- `README.md`: operator documentation and setup guide.
- `CLAUDE.md`: repository context and instructions for Claude.
