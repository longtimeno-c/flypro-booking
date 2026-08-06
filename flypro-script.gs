/**
 * ============================================================================
 * OUAS FLYPRO — WEEKLY AUTOMATION
 * ============================================================================
 *
 * Thursday 17:00   publish and lock the coming week, then prepare the next two
 *                  editable weeks and rebuild the FLYPRO summary
 * Sunday  23:00    hide the week that has ended and leave the coming week visible
 *
 * The documents are drawn by this script — there are no template files to
 * upload or keep in sync.
 *
 * ---------------------------------------------------------------------------
 * FIRST RUN
 *   1. Fill in the CONFIG block below (emails can wait — TEST_MODE covers you)
 *   2. Save, WAIT for "Unsaved changes" to clear, then run  setUpTriggers
 *
 * NEVER press Run while the editor says "Unsaved changes" — Apps Script will
 * execute the previously saved file with whatever function was selected then.
 * ---------------------------------------------------------------------------
 */


// ============================================================ CONFIG

var CONFIG = {
  // While true, all three drafts go to TEST_RECIPIENT and nowhere else.
  TEST_MODE: false,
  TEST_RECIPIENT: 'tphwoodlands@gmail.com',

  // Normal distribution messages are always created as Gmail drafts. This
  // setting is retained for visibility, but SEND is intentionally disabled.
  SEND_MODE: 'DRAFT',

  // Real distribution lists. Ignored while TEST_MODE is true.
  FLYPRO_TO: 'Eleanor.Hoogewerf845@mod.gov.uk,Andrew.Ouellette617@mod.gov.uk,simon.bowes391@mod.gov.uk,Andrew.Jones834@mod.gov.uk,James.Bellward100@mod.gov.uk,mark.doney511@mod.gov.uk,6fts-ouas-ops@mod.gov.uk,steve.pipa100@mod.gov.uk,Stephen.jones@babcockinternational.com',
  MT_TO: 'Stephen.jones@babcockinternational.com,Andrew.Jones834@mod.gov.uk,steve.pipa100@mod.gov.uk,mark.doney511@mod.gov.uk,sean.wheeler@babcockinternational.com',
  ACCOM_TO: 'BEN-AccomBooking-WOSM-OM@mod.gov.uk',
  CC: 'ouas.flying@gmail.com',
  ERROR_TO: 'tphwoodlands@gmail.com',
  READY_TO: 'tphwoodlands@gmail.com,aaryan.malik000@gmail.com',

  FLYPRO_SUBJECT: 'Flypro WC {week}',
  MT_SUBJECT: 'MT requests WC {week}',
  ACCOM_SUBJECT: 'Accommodation requests WC {week}',
  READY_SUBJECT: 'Flypro ready for review WC {week}',

  // Signature. If set, this HTML is used in preference to Gmail's send-as
  // signature. Leave blank to read the saved Gmail signature automatically.
  USE_GMAIL_SIGNATURE: true,
  // Leave blank to use Gmail's default send-as identity. Gmail's API does not
  // expose the separate Gmail signature names shown in Settings.
  GMAIL_SIGNATURE_SEND_AS: '',
  SIGNATURE_HTML: '<p style="margin:0">Kind regards,<br><br>' +
                 'Tristan<br>' +
                 'Officer Cadet Tristan Hill (RAFVR)<br>' +
                 '2IC Flying<br>' +
                 'Oxford University Air Squadron<br>' +
                 'Tel: <a href="tel:+447720642810">07720 642810</a> | ' +
                 'Email: <a href="mailto:retristan@pm.me">retristan@pm.me</a></p>',

  MET_TIME: '0830',          // met brief, shown on the Flypro document
  MT_MORNING: '0745',        // standard morning pickup

  TN_TEMPLATE_TAB: 'TN TEMPLATE',
  TEMPLATE_TAB: '[TEMPLATE FLYPRO]',

  PDF_FOLDER_ID: '11T3YqwBM2E2KCttDN09pqNAY-4_O3qkf',

  TIMEZONE: 'Europe/London'
};


// ============================================================ SHEET LAYOUT
// Positions after the template upgrade. If the template ever changes, this is
// the only block that needs editing.

var L = {
  dayCol: [2, 5, 8, 11, 14, 17, 20],          // B E H K N Q T
  dayName: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],

  rowDuty: 3,

  flyFirst: 5, flyLast: 12,      // Surname in dayCol, Sortie in dayCol+1
  mtFirst: 14, mtLast: 21,       // Surname in dayCol, Route  in dayCol+1
  accFirst: 23, accLast: 30      // Rank / Surname / Service No.
};

var NON_BID = ['no flying', 'no mt', 'tbc availability', 'surname', 'example', ''];

// ============================================================ ENTRY POINTS

/** Create the Thursday and Sunday time-driven triggers. Run once. */
function setUpTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'thursdayRun' || f === 'fridayRun' || f === 'sundayRun') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('thursdayRun').timeBased()
    .onWeekDay(ScriptApp.WeekDay.THURSDAY).atHour(17).nearMinute(0).create();
  ScriptApp.newTrigger('sundayRun').timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(23).nearMinute(0).create();

  Logger.log('Triggers created: Thursday 17:00 and Sunday 23:00. Removed any legacy Friday trigger.');
}

/**
 * Set the Sortie dropdown on the template (and any week tab that already exists)
 * to Instructional / AEF / Famil. Safe to run any time.
 */
/** Test on demand — same as the Thursday trigger. */
// ============================================================ THURSDAY

/** Publish only the Flypro PDF and email for the next Monday. */
function flyproRun() {
  try {
    return flyproRunCore();
  } catch (e) {
    notifyFailure('Unexpected Flypro run error', e);
    throw e;
  }
}

function flyproRunCore() {
  var target = loadTargetWeek('Flypro run');
  if (!target) return;

  assignDutyStudents(target.sh, target.week);
  var warnings = preflightFor(target.week, 'FLYPRO');
  if (stopForWarnings('Flypro run', warnings)) return;

  var folder = pdfFolder();
  var stamp = Utilities.formatDate(target.monday, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  var flypro = createFlyproPdf(folder, target.week, stamp);

  deliver(CONFIG.FLYPRO_SUBJECT.replace('{week}', prettyDate(target.monday)),
          flyproEmailBody(target.week), [flypro], CONFIG.FLYPRO_TO, 'FLYPRO');
  writePdfLink(target.sh, flypro.getUrl());
  Logger.log('Flypro output created for ' + target.tabName + '.');
}

/** Publish only the MT PDF and email for the next Monday. */
function mtRun() {
  try {
    return mtRunCore();
  } catch (e) {
    notifyFailure('Unexpected MT run error', e);
    throw e;
  }
}

function mtRunCore() {
  var target = loadTargetWeek('MT run');
  if (!target) return;

  var warnings = preflightFor(target.week, 'MT');
  if (stopForWarnings('MT run', warnings)) return;

  var folder = pdfFolder();
  var stamp = Utilities.formatDate(target.monday, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  var mt = createMtPdf(folder, target.week, stamp);

  deliver(CONFIG.MT_SUBJECT.replace('{week}', prettyDate(target.monday)),
          mtEmailBody(target.week), [mt], CONFIG.MT_TO, 'MT');
  Logger.log('MT output created for ' + target.tabName + '.');
}

/** Send only the accommodation email for the next Monday. */
function accomRun() {
  try {
    return accomRunCore();
  } catch (e) {
    notifyFailure('Unexpected accommodation run error', e);
    throw e;
  }
}

function accomRunCore() {
  var target = loadTargetWeek('Accommodation run');
  if (!target) return;

  var warnings = preflightFor(target.week, 'ACCOM');
  if (stopForWarnings('Accommodation run', warnings)) return;

  deliver(CONFIG.ACCOM_SUBJECT.replace('{week}', prettyDate(target.monday)),
          accomEmailBody(target.week), [], CONFIG.ACCOM_TO, 'ACCOM');
  Logger.log('Accommodation output created for ' + target.tabName + '.');
}

function thursdayRun() {
  try {
    return thursdayRunCore();
  } catch (e) {
    notifyFailure('Unexpected Thursday automation error', e);
    throw e;
  }
}

function thursdayRunCore() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var monday = nextMonday();
  var tabName = weekTabName(monday);
  var sh = ss.getSheetByName(tabName);

  if (!sh) {
    notifyFailure('Thursday run could not start',
                  'No tab named "' + tabName + '". Create it from the template, or check the naming.');
    Logger.log('No tab named "' + tabName + '" — nothing to publish. ' +
               'Create it from the template, or check the naming.');
    return;
  }

  if (!isNewFormat(sh)) {
    notifyFailure('Thursday run could not start',
                  '"' + tabName + '" uses the old 2-column layout and cannot be published.');
    Logger.log('"' + tabName + '" is the old 2-column layout — cannot publish from it. ' +
               'Create the week from the upgraded template.');
    return;
  }

  var week = parseWeek(sh, monday);
  assignDutyStudents(sh, week);
  var warnings = preflight(week);
  if (warnings.length) {
    var warningText = 'The Thursday run was stopped before creating PDFs, emails, or ' +
                      'locking/rolling sheets.\n\n' +
                      warnings.map(function (w) { return '- ' + w; }).join('\n');
    Logger.log('WARNINGS:\n  - ' + warnings.join('\n  - '));
    notifyFailure('Pre-flight checks failed', warningText);
    return;
  }

  var folder = pdfFolder();
  var stamp = Utilities.formatDate(monday, CONFIG.TIMEZONE, 'yyyy-MM-dd');

  var flypro = createFlyproPdf(folder, week, stamp);
  var mt = createMtPdf(folder, week, stamp);

  var weekText = prettyDate(monday);
  deliver(CONFIG.FLYPRO_SUBJECT.replace('{week}', weekText),
          flyproEmailBody(week), [flypro], CONFIG.FLYPRO_TO, 'FLYPRO');
  deliver(CONFIG.MT_SUBJECT.replace('{week}', weekText),
          mtEmailBody(week), [mt], CONFIG.MT_TO, 'MT');
  deliver(CONFIG.ACCOM_SUBJECT.replace('{week}', weekText),
          accomEmailBody(week), [], CONFIG.ACCOM_TO, 'ACCOM');
  notifyFlyproReady(week, flypro, mt);

  // Put the link on the week tab as part of the Thursday publication.
  writePdfLink(sh, flypro.getUrl());

  var props = PropertiesService.getDocumentProperties();
  props.setProperty('lastFlyproPdf', flypro.getUrl())
       .setProperty('lastWeekTab', tabName)
       .setProperty('weekToHideTab', weekTabName(addDays(monday, -7)));

  // Rebuild FLYPRO after publication so the current and coming weeks are both
  // visible until Sunday hides the week that has ended.

  lockSheet(sh);
  ensureFutureWeeksEditable(ss, monday);
  refreshFlyproSheet(ss, [addDays(monday, -7), monday]);
  Logger.log('Ordering sheets...');
  orderSheets(ss);
  Logger.log('Sheet ordering complete.');

  Logger.log('Done. PDFs in: ' + folder.getUrl());
}


function loadTargetWeek(label) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var monday = nextMonday();
  var tabName = weekTabName(monday);
  var sh = ss.getSheetByName(tabName);

  if (!sh) {
    notifyFailure(label + ' could not start',
                  'No tab named "' + tabName + '". Create it from the template, or check the naming.');
    Logger.log('No tab named "' + tabName + '" - nothing to publish.');
    return null;
  }

  if (!isNewFormat(sh)) {
    notifyFailure(label + ' could not start',
                  '"' + tabName + '" uses the old 2-column layout and cannot be published.');
    Logger.log('"' + tabName + '" uses the old 2-column layout - cannot publish from it.');
    return null;
  }

  return {
    ss: ss,
    monday: monday,
    tabName: tabName,
    sh: sh,
    week: parseWeek(sh, monday)
  };
}

function stopForWarnings(label, warnings) {
  if (!warnings.length) return false;

  var warningText = label + ' was stopped before creating output.\n\n' +
                    warnings.map(function (w) { return '- ' + w; }).join('\n');
  Logger.log('WARNINGS:\n  - ' + warnings.join('\n  - '));
  notifyFailure('Pre-flight checks failed', warningText);
  return true;
}

function createFlyproPdf(folder, week, stamp) {
  return shareAnyone(folder.createFile(
    htmlToPdf(flyproHtml(week), 'OUAS Flypro WC ' + stamp)));
}

function createMtPdf(folder, week, stamp) {
  return shareAnyone(folder.createFile(
    htmlToPdf(mtHtml(week), 'OUAS MT Programme WC ' + stamp)));
}


// ============================================================ READING THE SHEET

function parseWeek(sh, monday) {
  var values = sh.getRange(1, 1, L.accLast, 22).getValues();
  var days = [];

  for (var d = 0; d < 7; d++) {
    var c = L.dayCol[d] - 1;              // zero-based into values
    var day = {
      index: d,
      name: L.dayName[d],
      date: addDays(monday, d),
      // Row 3 is a manual duty-student selection. Do not infer or replace it.
      duty: str(values[L.rowDuty - 1][c]),
      flying: [],
      reserves: [],
      mt: [],
      accom: []
    };

    for (var r = L.flyFirst - 1; r <= L.flyLast - 1; r++) {
      var raw = str(values[r][c]);
      if (isNoise(raw)) continue;
      var p = parseName(raw);
      var sortie = str(values[r][c + 1]);
      var entry = { surname: p.surname, half: p.half, sortie: sortie };

      if (/reserve/i.test(sortie)) day.reserves.push(entry);
      else day.flying.push(entry);

    }

    for (var r2 = L.mtFirst - 1; r2 <= L.mtLast - 1; r2++) {
      var mraw = str(values[r2][c]);
      if (isNoise(mraw)) continue;
      var mp = parseName(mraw);
      day.mt.push({
        surname: mp.surname,
        route: str(values[r2][c + 1]),
        evenIfCancelled: mp.asterisk
      });
    }

    for (var r3 = L.accFirst - 1; r3 <= L.accLast - 1; r3++) {
      var surname = str(values[r3][c + 1]);
      if (isNoise(surname)) continue;
      day.accom.push({
        rank: str(values[r3][c]),
        surname: surname,
        serviceNo: str(values[r3][c + 2])
      });
    }

    days.push(day);
  }

  return { monday: monday, days: days, sheetName: sh.getName() };
}

/** "Bristow*" / "Knight (AM only)" → { surname, asterisk, half } */
function parseName(raw) {
  var s = raw.trim();
  var asterisk = /\*/.test(s);
  s = s.replace(/\*/g, '').trim();

  var half = '';
  var m = s.match(/\((AM|PM)[^)]*\)/i);
  if (m) { half = m[1].toUpperCase(); s = s.replace(m[0], '').trim(); }

  return { surname: s, asterisk: asterisk, half: half };
}

function isNoise(v) {
  return NON_BID.indexOf(String(v || '').trim().toLowerCase()) !== -1;
}

function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }

// ============================================================ DUTY STUDENT

/**
 * Select a random published participant for each day that has flying or a
 * reserve. A value already entered in row 3 remains a manual override.
 */
function assignDutyStudents(sh, week) {
  var assignments = [];

  week.days.forEach(function (day, d) {
    if (day.duty) return;

    var participants = day.flying.concat(day.reserves);
    if (!participants.length) return;

    var pick = participants[Math.floor(Math.random() * participants.length)];
    day.duty = pick.surname;
    assignments.push({ day: d, surname: day.duty });
  });

  if (!assignments.length) return;

  // The duty row inherits the availability dropdown from the row above when a
  // new week is created, which would reject a surname. Strip it before writing.
  sh.getRange(L.rowDuty, 2, 1, 21).clearDataValidations()
    .setFontColor('#000000').setFontWeight('bold').setBackground('#ffffff');
  assignments.forEach(function (assignment) {
    sh.getRange(L.rowDuty, L.dayCol[assignment.day]).setValue(assignment.surname);
  });
  SpreadsheetApp.flush();
}

// ============================================================ PRE-FLIGHT CHECKS

function preflight(week) {
  return preflightFor(week, 'ALL');
}

function preflightFor(week, scope) {
  var all = scope === 'ALL';
  var checkFlypro = all || scope === 'FLYPRO';
  var checkMt = all || scope === 'MT';
  var checkAccom = all || scope === 'ACCOM';
  var w = [];
  week.days.forEach(function (day) {
    var noFly = !day.flying.length && !day.reserves.length;

    if (checkFlypro && !noFly && !day.duty) {
      w.push(day.name + ': flying or reserve participants but no duty student was assigned');
    }
    if (checkAccom) {
      day.accom.forEach(function (a) {
        if (!a.rank) w.push(day.name + ': ' + a.surname + ' has no rank in the accom block');
        if (!a.serviceNo) w.push(day.name + ': ' + a.surname + ' has no service number');
      });
    }
    if (checkMt) {
      day.mt.forEach(function (m) {
        if (!m.route) w.push(day.name + ': ' + m.surname + ' has an MT bid with no route');
      });
    }
    if (checkFlypro && !noFly) {
      day.flying.forEach(function (f) {
        if (!f.sortie) w.push(day.name + ': ' + f.surname + ' has a flying bid with no sortie type');
      });
    }
  });
  return w;
}

/** Sends a real failure alert, even when normal delivery is in test/draft mode. */
function notifyFailure(title, details) {
  var detail = details && details.stack ? details.stack : String(details || 'No details available.');
  var body = 'The OUAS Flypro automation has stopped and requires attention.\n\n' +
             title + '\n\n' + detail + '\n\n' +
             'Time: ' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm') +
             '\nSpreadsheet: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl();

  try {
    GmailApp.sendEmail(CONFIG.ERROR_TO, '[URGENT] OUAS Flypro automation stopped', body, {
      name: 'OUAS Flypro'
    });
    Logger.log('Failure alert sent to ' + CONFIG.ERROR_TO);
  } catch (e) {
    Logger.log('Could not send failure alert: ' + e);
  }
}


// ============================================================ FLYPRO DOCUMENT

function flyproHtml(week) {
  var weekdays = week.days.slice(0, 5);

  var rows = weekdays.map(function (day) {
    // reserves are just another sortie type — everyone who bid gets published
    var all = day.flying.concat(day.reserves);
    var noFly = !all.length;

    // group by sortie type, AEF last so it is clearly separated
    var groups = {}, order = [];
    all.forEach(function (f) {
      var key = f.sortie || 'Sortie not given';
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(esc(f.surname) + (f.half ? ' (' + f.half + ' only)' : ''));
    });
    order.sort(function (a, b) {
      var aefA = /aef/i.test(a) ? 1 : 0, aefB = /aef/i.test(b) ? 1 : 0;
      return aefA !== aefB ? aefA - aefB : a.localeCompare(b);
    });

    var sorties = noFly
      ? '<i>NO FLYING</i>'
      : order.map(function (k) {
          return '<b>' + esc(k) + '</b><br>' + groups[k].join('<br>');
        }).join('<br><br>');

    var mt = day.mt.length
      ? day.mt.map(function (m) {
          return esc(m.surname) + ' &mdash; ' + esc(m.route) + (m.evenIfCancelled ? ' *' : '');
        }).join('<br>')
      : '&nbsp;';

    return '<tr>' +
      '<td class="day">' + day.name.substring(0, 3).toUpperCase() + '</td>' +
      '<td class="c">' + (noFly ? '&nbsp;' : CONFIG.MET_TIME) + '</td>' +
      '<td class="c">' + (noFly ? '&nbsp;' : esc(day.duty || '')) + '</td>' +
      '<td>' + sorties + '</td>' +
      '<td>' + mt + '</td>' +
      '</tr>';
  }).join('');

  return page(
    'OUAS FLYING PROGRAMME: ' + weekRangeLabel(week.monday),
    '<table>' +
      '<thead><tr>' +
        '<th style="width:7%">Days</th>' +
        '<th style="width:8%">MET</th>' +
        '<th style="width:14%">Duty Student</th>' +
        '<th style="width:37%">Sorties</th>' +
        '<th style="width:34%">MT</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p class="sig">Flying Programme Authority:&nbsp;&nbsp; Name: ______________________ &nbsp;&nbsp;' +
    'Signature: ______________________ &nbsp;&nbsp; Date: ____________</p>'
  );
}


// ============================================================ MT DOCUMENT

function mtHtml(week) {
  var weekdays = week.days.slice(0, 5);

  // one box per request, stacked down each day's column
  var depth = Math.max(6, Math.max.apply(null, weekdays.map(function (d) {
    return d.mt.length;
  })));

  var body = '';
  for (var r = 0; r < depth; r++) {
    body += '<tr>' + weekdays.map(function (day) {
      var m = day.mt[r];
      if (!m) {
        var blank = (r === 0 && !day.mt.length) ? '<i>No MT</i>' : '&nbsp;';
        return '<td class="box">' + blank + '</td>';
      }
      return '<td class="box"><b>' + esc(m.route) + '</b><br>' +
             esc(m.surname) + (m.evenIfCancelled ? ' *' : '') + '</td>';
    }).join('') + '</tr>';
  }

  return page(
    'MT Programme WC ' + prettyDate(week.monday),
    '<table><thead><tr>' +
      weekdays.map(function (d) { return '<th style="width:20%">' + d.name + '</th>'; }).join('') +
    '</tr></thead><tbody>' + body + '</tbody></table>' +
    '<p class="note">Morning requirement is ' + CONFIG.MT_MORNING +
    '. An asterisk means the pickup is still wanted even if flying is cancelled.</p>'
  );
}


// ============================================================ EMAIL BODIES

function flyproEmailBody(week) {
  return emailGreeting() + '\n\n' +
         'Please find attached the PSB flypro WC ' + prettyDate(week.monday) +
         '.\n';
}

function mtEmailBody(week) {
  return emailGreeting() + '\n\n' +
         'Please find attached the MT programme for the week commencing ' +
         prettyDate(week.monday) + '.\n';
}

/** Accommodation is a plain email, no attachment — dates, ranks, numbers, names. */
function accomEmailBody(week) {
  var out = [emailGreeting(), '',
             'Please could you arrange accommodation for the week commencing ' +
             prettyDate(week.monday) + ':', ''];
  var any = false;

  week.days.forEach(function (day) {
    if (!day.accom.length) return;
    any = true;
    out.push(day.name + ' ' + prettyDate(day.date));
    day.accom.forEach(function (a) {
      out.push('  ' + [a.rank, a.surname].filter(String).join(' ') +
               (a.serviceNo ? ' — ' + a.serviceNo : ''));
    });
    out.push('');
  });

  if (!any) out.push('There are no accommodation requests this week.');
  return out.join('\n');
}

/** Send reviewers the generated document links and the accommodation draft text. */
function notifyFlyproReady(week, flypro, mt) {
  if (CONFIG.TEST_MODE) {
    Logger.log('Flypro ready notification skipped in test mode.');
    return;
  }
  if (!CONFIG.READY_TO) {
    Logger.log('Flypro ready notification skipped: no READY_TO recipient set.');
    return;
  }

  var weekText = prettyDate(week.monday);
  var accom = accomEmailBody(week);
  var plain = 'Flypro is ready for review for the week commencing ' + weekText +
              '. The Flypro, MT, and accommodation distribution emails have ' +
              'been saved as drafts.\n\n' +
              'Flypro PDF: ' + flypro.getUrl() + '\n' +
              'MT PDF: ' + mt.getUrl() + '\n\n' +
              'Accommodation email draft:\n\n' + accom;
  var html = '<div style="font-family:Arial,sans-serif;font-size:11pt">' +
             '<p>Flypro is ready for review for the week commencing ' + esc(weekText) +
             '. The Flypro, MT, and accommodation distribution emails have been ' +
             'saved as drafts.</p>' +
             '<p><a href="' + esc(flypro.getUrl()) + '">Open Flypro PDF</a><br>' +
             '<a href="' + esc(mt.getUrl()) + '">Open MT PDF</a></p>' +
             '<p><b>Accommodation email draft</b></p>' +
             '<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">' +
             esc(accom) + '</pre></div>';

  GmailApp.sendEmail(CONFIG.READY_TO,
                     CONFIG.READY_SUBJECT.replace('{week}', weekText),
                     plain,
                     { name: 'OUAS Flypro', htmlBody: html });
  Logger.log('Flypro ready notification sent to ' + CONFIG.READY_TO + '.');
}

/** Uses a friendly greeting appropriate to the time the email is created. */
function emailGreeting() {
  var hour = Number(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'H'));
  if (hour < 12) return 'Good morning all,';
  if (hour < 18) return 'Good afternoon all,';
  return 'Good evening all,';
}


// ============================================================ DELIVERY

function deliver(subject, body, files, realTo, label) {
  var to = CONFIG.TEST_MODE ? CONFIG.TEST_RECIPIENT : realTo;
  if (!to) { Logger.log(label + ': no recipient set, skipped.'); return; }

  var sig = signatureHtml();
  var html = '<div style="font-family:Arial,sans-serif;font-size:11pt">' +
             esc(body).replace(/\n/g, '<br>') +
             (sig ? '<br><br>' + sig : '') +
             '</div>';

  var opts = { name: 'OUAS Flypro', htmlBody: html };
  if (CONFIG.CC && !CONFIG.TEST_MODE) opts.cc = CONFIG.CC;
  if (files.length) opts.attachments = files.map(function (f) { return f.getAs('application/pdf'); });

  var prefix = CONFIG.TEST_MODE ? '[TEST] ' : '';
  var full = prefix + subject;

  GmailApp.createDraft(to, full, body, opts);
  Logger.log(label + ': draft created for ' + to);
}

/**
 * Your saved Gmail signature.
 *
 * Needs the Gmail advanced service: in the editor, Services (+) → Gmail API → Add.
 * CONFIG.SIGNATURE_HTML is checked first; the Gmail signature is used only when
 * that setting is blank.
 *
 * Gmail's userId remains "me" because that means the authenticated account.
 * The API exposes signatures on send-as identities, not Gmail's separate
 * signature names from the Settings page.
 */
function signatureHtml() {
  // A configured signature is explicit and reliable, so prefer it to whichever
  // Gmail send-as signature happens to be exposed by the API.
  var configured = String(CONFIG.SIGNATURE_HTML || '').trim();
  if (configured) {
    Logger.log('Using CONFIG.SIGNATURE_HTML.');
    return configured;
  }

  if (CONFIG.USE_GMAIL_SIGNATURE) {
    try {
      var list = (Gmail.Users.Settings.SendAs.list('me').sendAs) || [];
      var target = String(CONFIG.GMAIL_SIGNATURE_SEND_AS || '').trim().toLowerCase();
      var selected = null;

      if (target) {
        list.forEach(function (a) {
          var name = String(a.displayName || '').trim().toLowerCase();
          var address = String(a.sendAsEmail || '').trim().toLowerCase();
          if (!selected && (name === target || address === target ||
                            name.indexOf(target) !== -1 || address.indexOf(target) !== -1)) {
            selected = a;
          }
        });
      }

      if (!selected) {
        list.forEach(function (a) { if (!selected && a.isDefault) selected = a; });
      }
      if (!selected) {
        list.forEach(function (a) { if (!selected && a.isPrimary) selected = a; });
      }
      if (!selected) selected = list[0] || null;

      if (selected && selected.signature) return selected.signature;
      if (target && !selected) {
        Logger.log('Gmail send-as "' + CONFIG.GMAIL_SIGNATURE_SEND_AS +
                   '" was not found. Available entries: ' +
                   list.map(function (a) {
                     return [a.displayName, a.sendAsEmail].filter(String).join(' / ');
                   }).join(', '));
      } else {
        Logger.log('Gmail send-as signature is empty and CONFIG.SIGNATURE_HTML is empty.');
      }
    } catch (e) {
      Logger.log('Gmail advanced service not enabled (' + e + ') and CONFIG.SIGNATURE_HTML is empty.');
    }
  }
  return '';
}

// ============================================================ FRIDAY / SUNDAY

// ============================================================ THE FLYPRO TAB
/**
 * Rebuild the FLYPRO tab from one or more week tabs. Thursday shows the current
 * and coming weeks together; Sunday leaves only the week starting next.
 */
function refreshFlyproSheet(ss, mondays) {
  var sh = ss.getSheetByName('FLYPRO');
  if (!sh) sh = ss.insertSheet('FLYPRO');

  sh.clear();
  sh.getImages().forEach(function (img) { img.remove(); });   // old pasted screenshots
  sh.setHiddenGridlines(true);
  [90, 70, 130, 300, 300].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  var weeks = Array.isArray(mondays) ? mondays : [mondays];
  var top = 1;
  var rendered = 0;

  weeks.forEach(function (monday, index) {
    var tab = ss.getSheetByName(weekTabName(monday));
    if (!tab) {
      Logger.log('No week tab found for ' + weekTabName(monday) + '.');
      return;
    }
    if (!isNewFormat(tab)) {
      Logger.log('Skipping ' + tab.getName() + ' — old 2-column layout.');
      return;
    }

    var heading = weeks.length > 1 && index === 1 ? 'NEXT WEEK' : 'THIS WEEK';
    top = drawProgramme(sh, top, parseWeek(tab, monday), '', heading) + 2;
    rendered++;
  });

  Logger.log(rendered ? 'FLYPRO tab rebuilt.' : 'No valid week tabs found for FLYPRO.');
}

/**
 * Does this tab use the upgraded 3-column-per-day layout?
 * The old tabs have "Rank & Surname" in the accommodation header; the new ones
 * have "Rank" then "Surname" in separate cells.
 */
function isNewFormat(sh) {
  var hdr = sh.getRange(L.accFirst - 1, L.dayCol[1], 1, 3).getValues()[0];
  return String(hdr[0]).trim().toLowerCase() === 'rank' &&
         String(hdr[1]).trim().toLowerCase() === 'surname';
}

/** Draw one week's programme onto the FLYPRO tab. Returns the last row used. */
function drawProgramme(sh, top, week, pdfUrl, heading) {
  var title = (heading || 'THIS WEEK') + ' — OUAS FLYING PROGRAMME: ' + weekRangeLabel(week.monday);

  sh.getRange(top, 1, 1, 5).merge().setValue(title)
    .setBackground('#1f3864')
    .setFontColor('#ffffff').setFontWeight('bold').setFontSize(12)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(top, 26);

  var head = top + 1;
  sh.getRange(head, 1, 1, 5)
    .setValues([['Days', 'MET', 'Duty Student', 'Sorties', 'MT']])
    .setBackground('#d9e2f3').setFontWeight('bold')
    .setHorizontalAlignment('center');

  var rows = week.days.slice(0, 5).map(function (day) {
    var all = day.flying.concat(day.reserves);
    var noFly = !all.length;

    var groups = {}, order = [];
    all.forEach(function (f) {
      var k = f.sortie || 'Sortie not given';
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(f.surname + (f.half ? ' (' + f.half + ' only)' : ''));
    });
    order.sort(function (a, b) {
      var A = /aef/i.test(a) ? 1 : 0, B = /aef/i.test(b) ? 1 : 0;
      return A !== B ? A - B : a.localeCompare(b);
    });

    var sorties = noFly ? 'NO FLYING'
      : order.map(function (k) { return k + ':\n  ' + groups[k].join('\n  '); }).join('\n\n');

    var mt = day.mt.map(function (m) {
      return m.surname + ' — ' + m.route + (m.evenIfCancelled ? ' *' : '');
    }).join('\n');

    return [day.name.substring(0, 3).toUpperCase(),
            noFly ? '' : CONFIG.MET_TIME,
            noFly ? '' : (day.duty || ''),
            sorties,
            mt];
  });

  var first = head + 1;
  // plain text, or Sheets turns 0830 into a number
  sh.getRange(first, 1, rows.length, 5).setNumberFormat('@');
  sh.getRange(first, 1, rows.length, 5).setValues(rows)
    .setVerticalAlignment('top').setWrap(true);
  sh.getRange(first, 1, rows.length, 2).setHorizontalAlignment('center');
  sh.getRange(first, 3, rows.length, 1).setHorizontalAlignment('center');
  sh.autoResizeRows(first, rows.length);

  var last = first + rows.length - 1;
  sh.getRange(head, 1, rows.length + 1, 5)
    .setBorder(true, true, true, true, true, true, '#000000',
               SpreadsheetApp.BorderStyle.SOLID);

  if (pdfUrl) {
    sh.getRange(last + 1, 1).setValue('PDF');
    sh.getRange(last + 1, 2, 1, 4).merge()
      .setFormula('=HYPERLINK("' + pdfUrl + '","Open the published PDF")')
      .setFontColor('#1155cc');
    last += 1;
  }

  sh.getRange(top, 1, last - top + 1, 5).setFontFamily('Arial').setFontSize(10);
  sh.getRange(top, 1).setFontSize(12);
  return last;
}

/** Put the link to the published PDF on the week tab, under the accommodation block. */
function writePdfLink(sh, url) {
  var row = L.accLast + 2;
  sh.getRange(row, 1).setValue('FLYPRO PDF').setFontWeight('bold');
  sh.getRange(row, 2)
    .setFormula('=HYPERLINK("' + url + '","Published Flypro PDF")')
    .setFontColor('#1155cc');
}

/** Hide the week that has ended while keeping it recoverable in this spreadsheet. */
function sundayRun() {
  try {
    return sundayRunCore();
  } catch (e) {
    notifyFailure('Unexpected Sunday automation error', e);
    throw e;
  }
}

function sundayRunCore() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getDocumentProperties();
  var tab = props.getProperty('weekToHideTab');

  // Lets this corrected Sunday behaviour work after a Thursday run that
  // completed before this version of the script was installed.
  if (!tab && props.getProperty('lastWeekTab')) {
    tab = weekTabName(addDays(nextMonday(), -7));
  }
  if (!tab) { Logger.log('Nothing to hide.'); return; }
  if (props.getProperty('lastSundayHiddenTab') === tab) {
    Logger.log(tab + ' was already hidden by the Sunday cleanup.');
    return;
  }

  var sh = ss.getSheetByName(tab);
  if (!sh) { Logger.log('Tab ' + tab + ' already gone.'); return; }

  var flypro = ss.getSheetByName('FLYPRO');
  if (flypro) flypro.activate();
  if (!sh.isSheetHidden()) {
    sh.hideSheet();
    Logger.log('Hid ended week tab ' + tab + '.');
  }

  // Rebuild FLYPRO for the week that begins the following Monday.
  refreshFlyproSheet(ss, nextMonday());
  Logger.log('Ordering sheets...');
  orderSheets(ss);
  Logger.log('Sheet ordering complete.');

  props.setProperty('lastSundayHiddenTab', tab);
  props.deleteProperty('weekToHideTab');
}


// ============================================================ SHEET HOUSEKEEPING

/** Keep templates and live programme tabs in a predictable order. */
function orderSheets(ss) {
  var sheets = ss.getSheets();
  var visibleSheets = sheets.filter(function (sh) { return !sh.isSheetHidden(); });
  var ordered = [];
  var used = {};

  function add(sh) {
    if (!sh || used[sh.getName()]) return;
    used[sh.getName()] = true;
    ordered.push(sh);
  }

  var tn = ss.getSheetByName(CONFIG.TN_TEMPLATE_TAB);
  if (!tn) {
    visibleSheets.forEach(function (sh) {
      var n = sh.getName().toLowerCase();
      if (!tn && /tn\s*template|template\s*tn/.test(n)) tn = sh;
    });
  }
  add(tn);
  add(ss.getSheetByName(CONFIG.TEMPLATE_TAB));
  add(ss.getSheetByName('FLYPRO'));

  var weeks = visibleSheets.filter(function (sh) { return /^WC\s+/i.test(sh.getName()); })
    .map(function (sh) {
      return { sheet: sh, locked: isSheetLocked(sh), date: weekDateValue(sh.getName()) };
    });
  weeks.sort(function (a, b) {
    if (a.locked !== b.locked) return a.locked ? 1 : -1;
    return b.date - a.date || a.sheet.getName().localeCompare(b.sheet.getName());
  });
  weeks.forEach(function (item) { add(item.sheet); });

  // Preserve any unrelated tabs, but keep them after the managed tabs.
  visibleSheets.forEach(add);

  ordered.forEach(function (sh, i) {
    if (sh.getIndex() === i + 1) return;
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(i + 1);
  });
}

function isSheetLocked(sh) {
  return sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length > 0;
}

/** Returns a sortable date for a tab named like "WC 10th August". */
function weekDateValue(name) {
  var m = /^WC\s+(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]+)/i.exec(name);
  if (!m) return 0;

  var months = ['january', 'february', 'march', 'april', 'may', 'june',
                'july', 'august', 'september', 'october', 'november', 'december'];
  var month = months.indexOf(m[2].toLowerCase());
  if (month < 0) return 0;

  var now = new Date();
  var years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  var best = null, distance = Infinity;
  years.forEach(function (year) {
    var candidate = new Date(year, month, Number(m[1]));
    var d = Math.abs(candidate.getTime() - now.getTime());
    if (d < distance) { best = candidate.getTime(); distance = d; }
  });
  return best || 0;
}

function lockSheet(sh) {
  if (isSheetLocked(sh)) {
    Logger.log(sh.getName() + ' is already locked.');
    return;
  }
  var p = sh.protect().setDescription('Locked at the Thursday 1700 deadline');
  p.removeEditors(p.getEditors());
  Logger.log('Locked ' + sh.getName());
}

/** Ensure the two weeks after the published week are visible and editable. */
function ensureFutureWeeksEditable(ss, publishedMonday) {
  ensureWeekEditable(ss, addDays(publishedMonday, 7));
  ensureWeekEditable(ss, addDays(publishedMonday, 14));
}

function ensureWeekEditable(ss, monday) {
  var sh = rollTemplateForward(ss, monday);
  if (!sh) {
    throw new Error('Could not create or find ' + weekTabName(monday) + '.');
  }

  if (sh.isSheetHidden()) {
    sh.showSheet();
    Logger.log('Made future week tab visible: ' + sh.getName());
  }

  var protections = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  if (protections.length) {
    protections.forEach(function (protection) { protection.remove(); });
    Logger.log('Unlocked future week tab ' + sh.getName() + '.');
  }
  return sh;
}

function rollTemplateForward(ss, monday) {
  var name = weekTabName(monday);
  var existing = ss.getSheetByName(name);
  if (existing) { Logger.log(name + ' already exists.'); return existing; }

  var tpl = ss.getSheetByName(CONFIG.TEMPLATE_TAB);
  if (!tpl) { Logger.log('Template tab not found.'); return null; }

  var copy = tpl.copyTo(ss).setName(name);
  copy.getRange(L.rowDuty, 2, 1, 21).clearDataValidations()
    .setFontColor('#000000').setFontWeight('bold').setBackground('#ffffff');
  ss.setActiveSheet(copy);
  ss.moveActiveSheet(indexOfTemplate(ss) + 1);
  Logger.log('Created ' + name);
  return copy;
}

function indexOfTemplate(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName() === CONFIG.TEMPLATE_TAB) return i + 1;
  }
  return 1;
}


// ============================================================ DRIVE

/** Anyone with the link can view — otherwise recipients hit a permission wall. */
function shareAnyone(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    Logger.log('Could not set link sharing on ' + file.getName() + ': ' + e);
  }
  return file;
}

function pdfFolder() {
  if (CONFIG.PDF_FOLDER_ID) return DriveApp.getFolderById(CONFIG.PDF_FOLDER_ID);
  var it = DriveApp.getFoldersByName('OUAS Flypro PDFs');
  var f = it.hasNext() ? it.next() : DriveApp.createFolder('OUAS Flypro PDFs');
  Logger.log('PDF folder id (put this in CONFIG): ' + f.getId());
  return f;
}

// ============================================================ PDF / HTML

function page(title, body) {
  return '<html><head><meta charset="utf-8"><style>' +
    '@page { size: A4 landscape; margin: 14mm; }' +
    'body { font-family: Arial, sans-serif; font-size: 10pt; color:#000; }' +
    'h1 { font-size: 14pt; text-align:center; margin: 0 0 12px 0; }' +
    'table { width:100%; border-collapse: collapse; table-layout: fixed; }' +
    'th { background:#1f3864; color:#fff; font-size:9.5pt; padding:5px; border:1px solid #000; }' +
    'td { border:1px solid #000; padding:5px; vertical-align: top; font-size:9.5pt; }' +
    'td.day { font-weight:bold; text-align:center; background:#f2f2f2; }' +
    'td.c { text-align:center; }' +
    '.res { margin-top:6px; font-size:8.5pt; color:#333; }' +
    '.route { margin-bottom:8px; }' +
    'td.box { height:52px; }' +
    '.sig { margin-top:22px; font-size:9pt; }' +
    '.note { margin-top:14px; font-size:8.5pt; color:#333; }' +
    '</style></head><body>' +
    '<h1>' + title + '</h1>' + body +
    '</body></html>';
}

function htmlToPdf(html, name) {
  return Utilities.newBlob(html, 'text/html', name + '.html')
    .getAs('application/pdf').setName(name + '.pdf');
}

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// ============================================================ DATES

function nextMonday() {
  var now = new Date();
  var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var delta = (8 - d.getDay()) % 7 || 7;      // always the NEXT Monday
  return addDays(d, delta);
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Matches the existing tab naming: "WC 3rd August" */
function weekTabName(monday) {
  return 'WC ' + ordinal(monday.getDate()) + ' ' +
         Utilities.formatDate(monday, CONFIG.TIMEZONE, 'MMMM');
}

function prettyDate(d) {
  return ordinal(d.getDate()) + ' ' +
         Utilities.formatDate(d, CONFIG.TIMEZONE, 'MMMM yyyy');
}

function weekRangeLabel(monday) {
  var friday = addDays(monday, 4);
  var sameMonth = monday.getMonth() === friday.getMonth();
  var left = ordinal(monday.getDate()) +
             (sameMonth ? '' : ' ' + Utilities.formatDate(monday, CONFIG.TIMEZONE, 'MMMM'));
  return left + ' - ' + ordinal(friday.getDate()) + ' ' +
         Utilities.formatDate(friday, CONFIG.TIMEZONE, 'MMMM yyyy');
}

function ordinal(n) {
  if (n > 3 && n < 21) return n + 'th';
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
}
