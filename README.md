# OUAS Flypro weekly automation

`flypro-script.gs` is a Google Apps Script for a Google Spreadsheet. It reads
the weekly flying, MT, duty-student, and accommodation entries; creates the
Flypro and MT PDFs; creates or sends three emails; maintains the `FLYPRO`
summary tab; and hides the week that has ended.

## Weekly schedule

Run `setUpTriggers()` once to create these time-driven triggers. The Apps Script
project timezone should be set to Europe/London.

| Time | Function | Action |
| --- | --- | --- |
| Thursday 17:00 | `thursdayRun` | Validate the coming week, create PDFs, create/send emails, add the PDF link, lock that week, ensure the following two week tabs are unlocked, and show the current plus coming week in `FLYPRO`. |
| Sunday 23:00 | `sundayRun` | Hide the week that has just ended and rebuild `FLYPRO` for the week beginning the next day. |

The Thursday run rebuilds `FLYPRO` to show both the current week and the coming
week. On Sunday, the current week tab is hidden and `FLYPRO` is rebuilt to show
only the week beginning the following day.

## Individual output runs

The following functions target the next Monday's week tab and can be run
independently from the Apps Script function menu:

| Function | Action |
| --- | --- |
| `flyproRun` | Creates and delivers only the Flypro PDF/email. |
| `mtRun` | Creates and delivers only the MT PDF/email. |
| `accomRun` | Delivers only the accommodation email. |

These runs use the configured `TEST_MODE` and `SEND_MODE` settings. They do
not lock the week, roll the template forward, update Sunday cleanup state, or
create the other outputs. The Flypro-only run updates the visible Flypro PDF
link on the week tab. To schedule one independently, create an Apps Script
installable trigger and select the relevant function as its event handler.

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
- `SEND_MODE`: retained as `DRAFT` for visibility; normal distribution emails
  are always created as drafts and are never sent automatically.
- `FLYPRO_TO`: Flypro distribution list.
- `MT_TO`: MT distribution list.
- `ACCOM_TO`: accommodation recipient.
- `CC`: copied on normal emails when test mode is disabled.
- `ERROR_TO`: urgent failure recipient, currently `tphwoodlands@gmail.com`.
- `READY_TO`: reviewers who receive the production "Flypro ready" email,
  currently `tphwoodlands@gmail.com` and `aaryan.malik000@gmail.com`.
- `FLYPRO_SUBJECT`: Flypro email subject, currently `Flypro WC {week}`.
- `MT_SUBJECT`: MT email subject, currently `MT requests WC {week}`.
- `ACCOM_SUBJECT`: accommodation email subject, currently `Accommodation requests WC {week}`.
- `READY_SUBJECT`: production reviewer-email subject, currently `Flypro ready for review WC {week}`.
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

Set `TEST_MODE` to `false` only after reviewing test drafts. In production, the
three distribution emails are still created as drafts and are never sent
automatically.

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

- Row 2: availability notes (retained for reference; not used by the script).
- Row 3: optional manually selected duty student for each day. If blank, the
  script randomly selects a participant from that day's flying or reserve list.
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
2. Uses the manually selected duty students in row 3, randomly filling any
   blank duty-student cells from that day's flying or reserve list.
3. Runs the pre-flight checks.
4. Stops immediately if any checks fail.
5. Creates the Flypro and MT PDFs in Drive.
6. Makes the PDFs viewable by anyone with the link.
7. Creates or sends the Flypro, MT, and accommodation emails.
8. Adds the Flypro PDF link to the week tab.
9. Locks the published week tab.
10. Creates or reopens the next two week tabs as unlocked, editable copies of
   the template.
11. Rebuilds `FLYPRO` to show the current week alongside the published week.

For example, publishing `WC 10th August` locks that tab and leaves `WC 17th
August` and `WC 24th August` visible and editable. On Thursday, `FLYPRO` shows
both `WC 3rd August` and `WC 10th August`. On the following Sunday, the script
hides `WC 3rd August` and leaves `WC 10th August` in `FLYPRO`.

Locking is idempotent: an already-protected week is not protected again. A
manual rerun can still create duplicate PDFs or drafts, so rerun Thursday only
when those duplicate outputs are acceptable.

The Flypro PDF covers Monday-Friday and contains MET, duty student, sorties,
and MT information in that column order. The MT PDF contains weekday transport
columns and route requests. The accommodation email contains dates, ranks,
names, and service numbers but has no attachment.

## Email behavior

The three emails use separate configured subjects. For example:

```text
Flypro WC 10th August 2026
MT requests WC 10th August 2026
Accommodation requests WC 10th August 2026
```

Test drafts are prefixed with `[TEST]`.

After a successful Thursday run with `TEST_MODE` set to `false`, the Flypro, MT,
and accommodation distribution messages are created as Gmail drafts addressed
to their real recipients. A real review notification is then sent to `READY_TO`
with links to the Flypro and MT PDFs and the full accommodation-email draft
text. This reviewer notification is not sent in test mode. Urgent failure alerts
continue to send directly to `ERROR_TO`.

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

- Accommodation has no rank.
- Accommodation has no service number.
- MT has no route.
- Flying has no sortie type.
- A flying or reserve participant has no duty student.
- The target week tab is missing.
- The target week tab uses the old layout.

A blank duty-student cell is allowed only when that day has no flying or reserve
participants; the programme is still published and the Duty Student field is
left blank for that day.

When a check fails, the script:

- Logs the complete list of problems.
- Sends an urgent email directly to `ERROR_TO`.
- Does not create PDFs.
- Does not create or send the normal distribution emails.
- Does not lock the week tab.
- Does not roll the template forward.

Unexpected Thursday or Sunday errors are also emailed to `ERROR_TO`
and then re-thrown so they remain visible in Apps Script execution logs. Failure
alerts bypass normal test/draft delivery settings because they are intended to
request immediate attention. If Gmail itself is unavailable, the script can
only log that the failure alert could not be sent.

## Sunday processing

Sunday hides the week that has just ended, rather than the week published on
Thursday, and rebuilds `FLYPRO` for the Monday that follows. The hidden tab
stays recoverable in the same spreadsheet.

## Initial setup

Run `setUpTriggers()` once to create or replace the Thursday and Sunday
triggers. It also removes the legacy Friday trigger. After that, the scheduled
triggers are the only entry points required for normal operation. Use
`flyproRun`, `mtRun`, or `accomRun` manually when one output needs to be created
or resent without running the other two.

## Important permissions

The script needs permission to use Google Sheets, Drive, Gmail, Gmail drafts,
and document properties. The Gmail advanced service is needed only when using
the Gmail signature lookup. Generated PDFs are configured as anyone-with-link
viewable; this may be restricted by organisational Drive policy.
