/**
 * ============================================================================
 * OUAS FLYPRO — WEEKLY AUTOMATION
 * ============================================================================
 *
 * Thursday 17:00   lock the closed week, roll the template forward, build the
 *                  Flypro and MT PDFs, and create three Gmail drafts
 * Friday  19:00    write the published PDF link into the week tab
 * Sunday  23:00    move the finished week tab to the archive spreadsheet
 *
 * The documents are drawn by this script — there are no template files to
 * upload or keep in sync.
 *
 * ---------------------------------------------------------------------------
 * FIRST RUN
 *   1. Fill in the CONFIG block below (emails can wait — TEST_MODE covers you)
 *   2. Save, WAIT for "Unsaved changes" to clear, then run  setUpTriggers
 *   3. To test without waiting for Thursday, run  runThursdayNow
 *
 * NEVER press Run while the editor says "Unsaved changes" — Apps Script will
 * execute the previously saved file with whatever function was selected then.
 * ---------------------------------------------------------------------------
 */


// ============================================================ CONFIG

var CONFIG = {
  // While true, all three drafts go to TEST_RECIPIENT and nowhere else.
  TEST_MODE: true,
  TEST_RECIPIENT: 'tphwoodlands@gmail.com',

  // DRAFT = create Gmail drafts for review.  SEND = send automatically.
  // Leave on DRAFT until you have watched it be right for a few weeks.
  SEND_MODE: 'DRAFT',

  // Real distribution lists. Ignored while TEST_MODE is true.
  FLYPRO_TO: 'Eleanor.Hoogewerf845@mod.gov.uk,Andrew.Ouellette617@mod.gov.uk,simon.bowes391@mod.gov.uk,Andrew.Jones834@mod.gov.uk,James.Bellward100@mod.gov.uk,mark.doney511@mod.gov.uk,6fts-ouas-ops@mod.gov.uk,steve.pipa100@mod.gov.uk,Stephen.jones@babcockinternational.com',
  MT_TO: 'Stephen.jones@babcockinternational.com,Andrew.Jones834@mod.gov.uk,steve.pipa100@mod.gov.uk,mark.doney511@mod.gov.uk,sean.wheeler@babcockinternational.com',
  ACCOM_TO: 'BEN-AccomBooking-WOSM-OM@mod.gov.uk',
  CC: 'ouas.flying@gmail.com',

  SUBJECT: 'Flypro WC {week}',

  // Signature. If set, this HTML is used in preference to Gmail's send-as
  // signature. Leave blank to read the saved Gmail signature automatically.
  USE_GMAIL_SIGNATURE: true,
  SIGNATURE_HTML: '',

  MET_TIME: '0830',          // met brief, shown on the Flypro document
  MT_MORNING: '0745',        // standard morning pickup

  TEMPLATE_TAB: '[TEMPLATE FLYPRO]',

  // Leave blank and the script creates them on first run, then logs the IDs.
  PDF_FOLDER_ID: '11T3YqwBM2E2KCttDN09pqNAY-4_O3qkf',
  ARCHIVE_SS_ID: '',

  TIMEZONE: 'Europe/London'
};


// ============================================================ SHEET LAYOUT
// Positions after the template upgrade. If the template ever changes, this is
// the only block that needs editing.

var L = {
  dayCol: [2, 5, 8, 11, 14, 17, 20],          // B E H K N Q T
  dayName: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],

  rowAvail: 2,
  rowDuty: 3,

  flyFirst: 5, flyLast: 12,      // Surname in dayCol, Sortie in dayCol+1
  mtFirst: 14, mtLast: 21,       // Surname in dayCol, Route  in dayCol+1
  accFirst: 23, accLast: 30      // Rank / Surname / Service No.
};

var NON_BID = ['no flying', 'no mt', 'tbc availability', 'surname', 'example', ''];

/** The only sortie types. Applied to the template dropdown by applySortieList(). */
var SORTIE_TYPES = ['Instructional', 'AEF', 'Famil'];


// ============================================================ ENTRY POINTS

/** Create the three time-driven triggers. Run once. */
function setUpTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'thursdayRun' || f === 'fridayRun' || f === 'sundayRun') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('thursdayRun').timeBased()
    .onWeekDay(ScriptApp.WeekDay.THURSDAY).atHour(17).nearMinute(0).create();
  ScriptApp.newTrigger('fridayRun').timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(19).nearMinute(0).create();
  ScriptApp.newTrigger('sundayRun').timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(23).nearMinute(0).create();

  Logger.log('Triggers created: Thursday 17:00, Friday 19:00, Sunday 23:00.');
}

/**
 * Set the Sortie dropdown on the template (and any week tab that already exists)
 * to Instructional / AEF / Famil. Safe to run any time.
 */
function applySortieList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(SORTIE_TYPES, true).setAllowInvalid(true).build();

  ss.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (n !== CONFIG.TEMPLATE_TAB && n.indexOf('WC ') !== 0) return;
    if (n.indexOf('old format') !== -1) return;

    L.dayCol.forEach(function (c) {
      sh.getRange(L.flyFirst, c + 1, L.flyLast - L.flyFirst + 1, 1).setDataValidation(rule);
    });
    Logger.log('Sortie list applied to ' + n);
  });
}

/** Test on demand — same as the Thursday trigger. */
function runThursdayNow() { thursdayRun(); }

/**
 * Build the documents and drafts WITHOUT locking or rolling anything over.
 * While testing it re-seeds the week first — delete the seedTestWeek() line once
 * real bids are going into the sheet.
 */
function previewOnly() {
  seedTestWeek();
  thursdayRun({ documentsOnly: true });
}


// ============================================================ THURSDAY

function thursdayRun(opts) {
  opts = opts || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var monday = nextMonday();
  var tabName = weekTabName(monday);
  var sh = ss.getSheetByName(tabName);

  if (!sh) {
    Logger.log('No tab named "' + tabName + '" — nothing to publish. ' +
               'Create it from the template, or check the naming.');
    return;
  }

  if (!isNewFormat(sh)) {
    Logger.log('"' + tabName + '" is the old 2-column layout — cannot publish from it. ' +
               'Create the week from the upgraded template.');
    return;
  }

  var week = parseWeek(sh, monday);
  assignDutyStudents(sh, week);

  var warnings = preflight(week);
  if (warnings.length) Logger.log('WARNINGS:\n  - ' + warnings.join('\n  - '));

  var folder = pdfFolder();
  var stamp = Utilities.formatDate(monday, CONFIG.TIMEZONE, 'yyyy-MM-dd');

  var flypro = shareAnyone(folder.createFile(
    htmlToPdf(flyproHtml(week), 'OUAS Flypro WC ' + stamp)));
  var mt = shareAnyone(folder.createFile(
    htmlToPdf(mtHtml(week), 'OUAS MT Programme WC ' + stamp)));

  var subject = CONFIG.SUBJECT.replace('{week}', prettyDate(monday));

  deliver(subject, flyproEmailBody(week), [flypro], CONFIG.FLYPRO_TO, 'FLYPRO');
  deliver(subject, mtEmailBody(week), [mt], CONFIG.MT_TO, 'MT');
  deliver(subject, accomEmailBody(week), [], CONFIG.ACCOM_TO, 'ACCOM');

  // put the link on the week tab straight away, rather than waiting for Friday
  writePdfLink(sh, flypro.getUrl());

  var props = PropertiesService.getDocumentProperties();
  props.setProperty('prevFlyproPdf', props.getProperty('lastFlyproPdf') || '')
       .setProperty('lastFlyproPdf', flypro.getUrl())
       .setProperty('lastWeekTab', tabName);

  // publish onto the FLYPRO tab — this week plus last week
  refreshFlyproSheet(ss, monday);

  if (!opts.documentsOnly) {
    lockSheet(sh);
    rollTemplateForward(ss, addDays(monday, 7));
  }

  Logger.log('Done. PDFs in: ' + folder.getUrl());
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
      availability: str(values[L.rowAvail - 1][c]),
      dutyOverride: str(values[L.rowDuty - 1][c]),
      flying: [],
      reserves: [],
      attending: [],                       // asterisk — coming but not flying
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

      if (p.asterisk) day.attending.push(entry);
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
 * Pick a duty student for each day: anyone flying AEF, otherwise anyone flying.
 * Avoids using the same person twice in a week where there is a choice.
 * A surname typed into the override row always wins.
 */
function assignDutyStudents(sh, week) {
  var used = {};

  week.days.forEach(function (day) {
    if (day.dutyOverride) { day.duty = day.dutyOverride; return; }

    var aef = day.flying.filter(function (f) { return /aef/i.test(f.sortie); });
    var pool = aef.length ? aef : day.flying;

    if (!pool.length) { day.duty = ''; return; }

    var fresh = pool.filter(function (p) { return !used[p.surname.toLowerCase()]; });
    var pick = (fresh.length ? fresh : pool)[0];

    day.duty = pick.surname;
    used[pick.surname.toLowerCase()] = true;
  });

  // The duty row inherits the availability dropdown from the row above when a new
  // week is created, which would reject a surname. Strip it before writing.
  sh.getRange(L.rowDuty, 2, 1, 21).clearDataValidations();

  // the duty row inherits white bold text from the availability row above it,
  // which makes anything written here invisible
  sh.getRange(L.rowDuty, 2, 1, 21)
    .setFontColor('#000000').setFontWeight('bold').setBackground('#ffffff');

  // write the choices back into row 3 so they are visible before you send
  week.days.forEach(function (day, d) {
    if (day.dutyOverride) return;
    sh.getRange(L.rowDuty, L.dayCol[d]).setValue(day.duty);
  });
  SpreadsheetApp.flush();
}


// ============================================================ PRE-FLIGHT CHECKS

function preflight(week) {
  var w = [];
  week.days.forEach(function (day) {
    if (/no flying/i.test(day.availability)) return;

    if (day.flying.length && !day.duty) {
      w.push(day.name + ': people flying but no duty student could be chosen');
    }
    day.accom.forEach(function (a) {
      if (!a.rank) w.push(day.name + ': ' + a.surname + ' has no rank in the accom block');
      if (!a.serviceNo) w.push(day.name + ': ' + a.surname + ' has no service number');
    });
    day.mt.forEach(function (m) {
      if (!m.route) w.push(day.name + ': ' + m.surname + ' has an MT bid with no route');
    });
    day.flying.forEach(function (f) {
      if (!f.sortie) w.push(day.name + ': ' + f.surname + ' has a flying bid with no sortie type');
    });
  });
  return w;
}


// ============================================================ FLYPRO DOCUMENT

function flyproHtml(week) {
  var weekdays = week.days.slice(0, 5);

  var rows = weekdays.map(function (day) {
    // reserves are just another sortie type — everyone who bid gets published
    var all = day.flying.concat(day.reserves);
    var noFly = /no flying/i.test(day.availability) || !all.length;

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
      '<td>' + sorties + '</td>' +
      '<td class="c">' + (noFly ? '&nbsp;' : esc(day.duty || '')) + '</td>' +
      '<td>' + mt + '</td>' +
      '</tr>';
  }).join('');

  return page(
    'OUAS FLYING PROGRAMME: ' + weekRangeLabel(week.monday),
    '<table>' +
      '<thead><tr>' +
        '<th style="width:7%">Days</th>' +
        '<th style="width:8%">MET</th>' +
        '<th style="width:37%">Sorties</th>' +
        '<th style="width:14%">Duty Student</th>' +
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

  if (CONFIG.SEND_MODE === 'SEND') {
    GmailApp.sendEmail(to, full, body, opts);
    Logger.log(label + ': sent to ' + to);
  } else {
    GmailApp.createDraft(to, full, body, opts);
    Logger.log(label + ': draft created for ' + to);
  }
}

/**
 * Your saved Gmail signature.
 *
 * Needs the Gmail advanced service: in the editor, Services (+) → Gmail API → Add.
 * CONFIG.SIGNATURE_HTML is checked first; the Gmail signature is used only when
 * that setting is blank.
 *
 * Gmail only exposes the DEFAULT signature for each send-as address. If your OUAS
 * signature is not the default, paste its HTML into CONFIG.SIGNATURE_HTML.
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
      var primary = null;
      list.forEach(function (a) { if (a.isPrimary) primary = a; });
      var found = (primary && primary.signature) ? primary.signature : '';
      if (!found) {
        list.forEach(function (a) { if (!found && a.signature) found = a.signature; });
      }
      if (found) return found;
      Logger.log('Gmail returned no signature and CONFIG.SIGNATURE_HTML is empty.');
    } catch (e) {
      Logger.log('Gmail advanced service not enabled (' + e + ') and CONFIG.SIGNATURE_HTML is empty.');
    }
  }
  return '';
}

/** Prints the signature the script can see. Run this to check it found the right one. */
function showSignature() {
  var s = signatureHtml();
  Logger.log(s ? 'Signature found:\n' + s : 'No signature found.');
}


// ============================================================ FRIDAY / SUNDAY

// ============================================================ THE FLYPRO TAB
/**
 * Rebuild the FLYPRO tab: this week's published programme at the top, last week's
 * underneath. Rebuilt from the week tabs themselves, so there is no stored state to
 * go stale. On Sunday the old week tab is archived and this is rebuilt, which leaves
 * only the current week.
 */
function refreshFlyproSheet(ss, currentMonday) {
  var sh = ss.getSheetByName('FLYPRO');
  if (!sh) sh = ss.insertSheet('FLYPRO');

  sh.clear();
  sh.getImages().forEach(function (img) { img.remove(); });   // old pasted screenshots
  sh.setHiddenGridlines(true);
  [90, 70, 300, 130, 300].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  var props = PropertiesService.getDocumentProperties();
  var row = 1;

  [0, -7].forEach(function (offset) {
    var monday = addDays(currentMonday, offset);
    var tab = ss.getSheetByName(weekTabName(monday));
    if (!tab) return;
    if (!isNewFormat(tab)) {
      Logger.log('Skipping ' + tab.getName() + ' — old 2-column layout.');
      return;
    }

    var wk = parseWeek(tab, monday);
    wk.days.forEach(function (d) { d.duty = d.dutyOverride; });

    var url = props.getProperty(offset === 0 ? 'lastFlyproPdf' : 'prevFlyproPdf') || '';
    row = drawProgramme(sh, row, wk, offset === 0, url) + 2;
  });

  Logger.log('FLYPRO tab rebuilt.');
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
function drawProgramme(sh, top, week, isCurrent, pdfUrl) {
  var title = (isCurrent ? 'THIS WEEK — ' : 'LAST WEEK — ') +
              'OUAS FLYING PROGRAMME: ' + weekRangeLabel(week.monday);

  sh.getRange(top, 1, 1, 5).merge().setValue(title)
    .setBackground(isCurrent ? '#1f3864' : '#7f7f7f')
    .setFontColor('#ffffff').setFontWeight('bold').setFontSize(12)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(top, 26);

  var head = top + 1;
  sh.getRange(head, 1, 1, 5)
    .setValues([['Days', 'MET', 'Sorties', 'Duty Student', 'MT']])
    .setBackground('#d9e2f3').setFontWeight('bold')
    .setHorizontalAlignment('center');

  var rows = week.days.slice(0, 5).map(function (day) {
    var all = day.flying.concat(day.reserves);
    var noFly = /no flying/i.test(day.availability) || !all.length;

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
            sorties,
            noFly ? '' : (day.duty || ''),
            mt];
  });

  var first = head + 1;
  // plain text, or Sheets turns 0830 into a number
  sh.getRange(first, 1, rows.length, 5).setNumberFormat('@');
  sh.getRange(first, 1, rows.length, 5).setValues(rows)
    .setVerticalAlignment('top').setWrap(true);
  sh.getRange(first, 1, rows.length, 2).setHorizontalAlignment('center');
  sh.getRange(first, 4, rows.length, 1).setHorizontalAlignment('center');
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

/** Friday: make sure this week's link is there, and remove last week's. */
function fridayRun() {
  var props = PropertiesService.getDocumentProperties();
  var url = props.getProperty('lastFlyproPdf');
  var tab = props.getProperty('lastWeekTab');
  if (!url || !tab) { Logger.log('Nothing published this week.'); return; }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(tab);
  if (!sh) { Logger.log('Tab ' + tab + ' has gone.'); return; }

  var prev = props.getProperty('previousLinkTab');
  if (prev && prev !== tab) {
    var ps = ss.getSheetByName(prev);
    if (ps) ps.getRange(L.accLast + 2, 1, 1, 2).clearContent();
  }

  writePdfLink(sh, url);
  props.setProperty('previousLinkTab', tab);
  Logger.log('Link confirmed on ' + tab + ', previous week cleared.');
}

/** Move the finished week tab into the archive spreadsheet. */
function sundayRun() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tab = PropertiesService.getDocumentProperties().getProperty('lastWeekTab');
  if (!tab) { Logger.log('Nothing to archive.'); return; }

  var sh = ss.getSheetByName(tab);
  if (!sh) { Logger.log('Tab ' + tab + ' already gone.'); return; }

  var archive = archiveSpreadsheet();
  sh.copyTo(archive).setName(tab);
  ss.deleteSheet(sh);
  Logger.log('Archived ' + tab + ' to ' + archive.getUrl());

  // rebuild FLYPRO — last week's tab has gone, so only this week remains
  refreshFlyproSheet(ss, nextMonday());
}


// ============================================================ SHEET HOUSEKEEPING

function lockSheet(sh) {
  var p = sh.protect().setDescription('Locked at the Thursday 1700 deadline');
  p.removeEditors(p.getEditors());
  Logger.log('Locked ' + sh.getName());
}

function rollTemplateForward(ss, monday) {
  var name = weekTabName(monday);
  if (ss.getSheetByName(name)) { Logger.log(name + ' already exists.'); return; }

  var tpl = ss.getSheetByName(CONFIG.TEMPLATE_TAB);
  if (!tpl) { Logger.log('Template tab not found.'); return; }

  var copy = tpl.copyTo(ss).setName(name);
  copy.getRange(L.rowDuty, 2, 1, 21).clearDataValidations();
  ss.setActiveSheet(copy);
  ss.moveActiveSheet(indexOfTemplate(ss) + 1);
  Logger.log('Created ' + name);
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

function archiveSpreadsheet() {
  if (CONFIG.ARCHIVE_SS_ID) return SpreadsheetApp.openById(CONFIG.ARCHIVE_SS_ID);
  var it = DriveApp.getFilesByName('Flypro Archive');
  var ss = it.hasNext() ? SpreadsheetApp.open(it.next())
                        : SpreadsheetApp.create('Flypro Archive');
  Logger.log('Archive spreadsheet id (put this in CONFIG): ' + ss.getId());
  return ss;
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


// ============================================================ TEST DATA
/**
 * Build a realistic week tab from the upgraded template so the automation can be
 * dry-run. Any existing tab of the same name is renamed and hidden, not deleted.
 * Run this once, then run previewOnly.
 */
function seedTestWeek() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var monday = nextMonday();
  var name = weekTabName(monday);

  var existing = ss.getSheetByName(name);
  if (existing) {
    var parked = name + ' (old format)';
    if (ss.getSheetByName(parked)) ss.deleteSheet(ss.getSheetByName(parked));
    existing.setName(parked);
    existing.hideSheet();
  }

  var tpl = ss.getSheetByName(CONFIG.TEMPLATE_TAB);
  if (!tpl) throw new Error('Template tab not found');
  var sh = tpl.copyTo(ss).setName(name);
  sh.getRange(L.rowDuty, 2, 1, 21).clearDataValidations();
  ss.setActiveSheet(sh);
  ss.moveActiveSheet(indexOfTemplate(ss) + 1);

  // day index → { fly:[[surname, sortie]], mt:[[surname, route]], acc:[[rank, surname, no]] }
  var data = {
    1: {  // Tuesday
      fly: [['Bristow', 'Instructional'], ['Ashmore', 'Instructional'],
            ['Reed-Waller', 'Instructional'], ['Pun', 'AEF'],
            ['Littlejohns', 'Famil'], ['Ward', 'AEF']],
      mt: [['Penman', '1730 CHOLSEY → BENSON'], ['Knight*', '0745 THQ → BENSON']],
      acc: [['Off Cdt', 'Bristow', '30452180'], ['APO', 'Ashmore', '30421677'],
            ['APO', 'Darvell', '30444297']]
    },
    2: {  // Wednesday
      fly: [['Bristow', 'Instructional'], ['Ashmore', 'Instructional'],
            ['Penman', 'Famil'], ['Ward', 'AEF'],
            ['Knight (AM only)', 'Instructional']],
      mt: [['Penman', '1630 BENSON → THQ']],
      acc: [['Off Cdt', 'Bristow', '30452180'], ['APO', 'Ashmore', '30421677'],
            ['APO', 'Penman', '30404068']]
    },
    3: {  // Thursday
      fly: [['Reed-Waller', 'Instructional'], ['Littlejohns', 'Instructional'],
            ['Pun', 'AEF'], ['Elms', 'Famil']],
      mt: [['Elms', '0745 BUCKS → BENSON']],
      acc: [['Off Cdt', 'Littlejohns', '30444480'], ['Off Cdt', 'Elms', '30421670']]
    },
    4: {  // Friday
      fly: [['Bristow', 'Instructional'], ['Penman', 'Instructional'],
            ['Ward', 'AEF'], ['Knight', 'Instructional'], ['Coleman', 'Famil']],
      mt: [['Coleman', '1630 BENSON → BUCKS'], ['Hooper', '1730 BUCKS → BENSON']],
      acc: [['Off Cdt', 'Coleman', '30471688'], ['Off Cdt', 'Hooper', '30469686'],
            ['APO', 'Penman', '30404068']]
    }
  };

  Object.keys(data).forEach(function (k) {
    var d = Number(k), col = L.dayCol[d], set = data[k];

    set.fly.forEach(function (row, i) {
      sh.getRange(L.flyFirst + i, col).setValue(row[0]);
      sh.getRange(L.flyFirst + i, col + 1).setValue(row[1]);
    });
    set.mt.forEach(function (row, i) {
      sh.getRange(L.mtFirst + i, col).setValue(row[0]);
      sh.getRange(L.mtFirst + i, col + 1).setValue(row[1]);
    });
    set.acc.forEach(function (row, i) {
      sh.getRange(L.accFirst + i, col, 1, 3).setValues([row]);
    });
  });

  applySortieList();
  SpreadsheetApp.flush();
  Logger.log('Seeded "' + name + '". Now run previewOnly.');
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
