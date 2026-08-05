# OUAS Flypro weekly automation

`flypro-script.gs` is a Google Apps Script for a Google Spreadsheet. It reads
the weekly flying, MT, duty-student, and accommodation entries; creates the
Flypro and MT PDFs; creates or sends three emails; maintains the `FLYPRO`
summary tab; and hides the completed week.

## Weekly schedule

Run `setUpTriggers()` once to create these time-driven triggers. The Apps Script
project timezone should be set to Europe/London.

| Time | Function | Action |
| --- | --- | --- |
| Thursday 17:00 | `thursdayRun` | Validate the week, create PDFs, create/send emails, add the PDF link, lock the week, and create the next template tab. |
| Friday 19:00 | `fridayRun` | Confirm the PDF link and remove the previous link. |
| Sunday 23:00 | `sundayRun` | Hide the previous week in the active spreadsheet and rebuild `FLYPRO` so the upcoming week remains. |

The Thursday run leaves the existing `FLYPRO` summary unchanged. The summary
is rebuilt on Sunday after the previous week has been hidden.

After Thursday and Sunday processing, sheets are ordered as follows:

1. TN template.
2. Flypro template.
3. `FLYPRO` summary.
4. Unlocked `WC` tabs, furthest week to soonest week.
5. Locked `WC` tabs.
6. Any unrelated tabs.

## Configuration

The `CONFIG` object at the top of `flypro-script.gs` contains:

- `TEST_MODE`: when `true`, normal emails use only `TEST_RECIPIENT`.
- `TEST_RECIPIENT`: the test recipient, currently `tphwoodlands@gmail.com`.
- `SEND_MODE`: `DRAFT` creates Gmail drafts; `SEND` sends normal emails.
- `FLYPRO_TO`: Flypro distribution list.
- `MT_TO`: MT distribution list.
- `ACCOM_TO`: accommodation recipient.
- `CC`: copied on normal emails when test mode is disabled.
- `ERROR_TO`: urgent failure recipient, currently `tphwoodlands@gmail.com`.
- `FLYPRO_SUBJECT`: Flypro email subject, currently `Flypro WC {week}`.
- `MT_SUBJECT`: MT email subject, currently `MT requests WC {week}`.
- `ACCOM_SUBJECT`: accommodation email subject, currently `Accommodation requests WC {week}`.
- `SIGNATURE_HTML`: explicit OUAS HTML signature used by the emails.
- `USE_GMAIL_SIGNATURE`: if enabled and `SIGNATURE_HTML` is blank, read the configured Gmail send-as signature.
- `GMAIL_SIGNATURE_SEND_AS`: optional Gmail send-as display name or email address. Leave blank to use Gmail's default send-as identity.
- `MET_TIME`: MET time shown on the Flypro document.
- `MT_MORNING`: morning requirement shown on the MT document.
- `TN_TEMPLATE_TAB`: name of the nominal-roll/TN template tab.
- `TEMPLATE_TAB`: name of the weekly template tab.
- `PDF_FOLDER_ID`: Drive folder used for generated PDFs.
- `TIMEZONE`: date and time formatting timezone.

The safe initial settings are:

```javascript
TEST_MODE: true,
SEND_MODE: 'DRAFT'
```

Set `TEST_MODE` to `false` only after reviewing test drafts. Set `SEND_MODE` to
`SEND` only when automatic sending is approved.

## Required weekly sheet layout

The script expects a tab named like `WC 10th August`. Each day uses three
columns:

| Day | Columns |
| --- | --- |
| Monday | B:C:D |
| Tuesday | E:F:G |
| Wednesday | H:I:J |
| Thursday | K:L:M |
| Friday | N:O:P |
| Saturday | Q:R:S |
| Sunday | T:U:V |

The rows are:

- Row 2: availability.
- Row 3: optional duty-student override.
- Rows 5-12: flying surname and sortie type.
- Rows 14-21: MT surname and route.
- Rows 23-30: accommodation rank, surname, and service number.

The upgraded format must have separate `Rank` and `Surname` accommodation
headers. Older two-column tabs are rejected.

Entries such as `no flying`, `no mt`, `tbc availability`, `surname`, and
`example` are treated as placeholders and ignored.

Names may include an asterisk or an AM/PM note, for example:

```text
Knight*
Knight (AM only)
```

An MT asterisk means the pickup is still wanted if flying is cancelled.

## Thursday processing

The Thursday run always targets the next Monday and looks for that week tab.
It then:

1. Reads all week data from the sheet.
2. Assigns duty students, preferring AEF flyers and avoiding repeat selections where possible.
3. Applies any manually entered duty-student overrides.
4. Runs the pre-flight checks.
5. Stops immediately if any checks fail.
6. Creates the Flypro and MT PDFs in Drive.
7. Makes the PDFs viewable by anyone with the link.
8. Creates or sends the Flypro, MT, and accommodation emails.
9. Adds the Flypro PDF link to the week tab.
10. Locks the completed week tab.
11. Copies the template forward to create the next week tab.

Locking is idempotent: an already-protected week is not protected again. A
manual rerun can still create duplicate PDFs or drafts, so rerun Thursday only
when those duplicate outputs are acceptable.

The Flypro PDF covers Monday-Friday and contains MET, sorties, duty student,
and MT information. The MT PDF contains weekday transport columns and route
requests. The accommodation email contains dates, ranks, names, and service
numbers but has no attachment.

## Email behavior

The three emails use separate configured subjects. For example:

```text
Flypro WC 10th August 2026
MT requests WC 10th August 2026
Accommodation requests WC 10th August 2026
```

Test drafts are prefixed with `[TEST]`.

The Flypro email includes a friendly time-based greeting and a polite request
such as:

```text
Good afternoon all,

Please find attached the PSB flypro WC 10th August 2026.
```

The configured signature is appended as HTML. `CONFIG.SIGNATURE_HTML` takes
priority over Gmail. Otherwise, the script selects the configured send-as
identity, or Gmail's default send-as identity when the setting is blank.

Gmail's API does not expose the separate signature names shown in Gmail
Settings. To use the signature named `OUAS`, set it as the default signature
for new emails for the relevant send-as address in Gmail. Alternatively, paste
the OUAS signature HTML into `CONFIG.SIGNATURE_HTML` for an exact, explicit
selection.

## Failure and validation behavior

The following checks stop the Thursday run:

- Flying exists but no duty student can be selected.
- Accommodation has no rank.
- Accommodation has no service number.
- MT has no route.
- Flying has no sortie type.
- The target week tab is missing.
- The target week tab uses the old layout.

When a check fails, the script:

- Logs the complete list of problems.
- Sends an urgent email directly to `ERROR_TO`.
- Does not create PDFs.
- Does not create or send the normal distribution emails.
- Does not lock the week tab.
- Does not roll the template forward.

Unexpected Thursday, Friday, or Sunday errors are also emailed to `ERROR_TO`
and then re-thrown so they remain visible in Apps Script execution logs. Failure
alerts bypass normal test/draft delivery settings because they are intended to
request immediate attention. If Gmail itself is unavailable, the script can
only log that the failure alert could not be sent.

## Friday and Sunday processing

Friday confirms the Flypro PDF link on the published week tab and clears the
previous week’s link.

Sunday hides the published week tab in the active spreadsheet and rebuilds
`FLYPRO`. The hidden tab stays recoverable in the same spreadsheet while the
upcoming week remains on the summary tab.

## Initial setup

Run `setUpTriggers()` once to create or replace the Thursday, Friday, and Sunday
triggers. After that, the scheduled triggers are the only entry points required
for normal operation.

## Important permissions

The script needs permission to use Google Sheets, Drive, Gmail, Gmail drafts,
and document properties. The Gmail advanced service is needed only when using
the Gmail signature lookup. Generated PDFs are configured as anyone-with-link
viewable; this may be restricted by organisational Drive policy.
