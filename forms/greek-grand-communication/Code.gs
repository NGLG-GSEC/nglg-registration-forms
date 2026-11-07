const CONFIG = Object.freeze({
  spreadsheetProperty: 'SPREADSHEET_ID',
  organizerEmailProperty: 'ORGANIZER_EMAIL',
  eventSheets: {
    dec2026: 'DEC 2026',
    may2027: 'MAY 2027'
  },
  lodgesSheet: 'lodges',
  webTextSheet: 'web text',
  messageSheetCandidates: ['cover', 'cover '],
  statisticsSheet: 'Στατιστικά',
  timezone: 'Europe/Athens'
});

const RESPONSE_HEADERS = [
  'register day', 'name', 'surname', 'Salutation', 'Office',
  'Province', 'Lodge', 'Partner', 'mobile', 'email'
];

const EVENT_DETAILS = Object.freeze({
  dec2026: {
    title: 'Μεγάλη Συνέλευση 19ης Δεκεμβρίου 2026',
    dinner: 'το δείπνο της 19ης Δεκ στην Κέρκυρα'
  },
  may2027: {
    title: 'Μεγάλη Συνέλευση 15ης Μαΐου 2027',
    dinner: 'το δείπνο της 15ης Μαΐου 2027'
  }
});

const LODGE_NUMBERS = [
  1,2,3,4,5,6,8,9,10,11,12,13,15,16,17,18,19,21,23,24,26,28,29,30,31,32,33,36,
  39,42,44,48,50,52,53,54,55,58,59,60,61,62,64,66,67,69,70,71,74,76,78,80,84,85,
  86,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,
  110,111,112,113,114,115,116,117,''
];

const PROVINCES = [
  'ΑΘΗΝΩΝ',
  'ΠΕΙΡΑΙΩΣ & ΑΙΓΑΙΟΥ',
  'ΙΟΝΙΩΝ ΝΗΣΩΝ',
  'ΔΥΤΙΚΗΣ ΕΛΛΑΔΟΣ',
  'ΚΕΝΤΡΙΚΗΣ & ΒΟΡΕΙΟΥ ΕΛΛΑΔΟΣ',
  'ΚΥΠΡΟΥ'
];

// ---------------------------------------------------------------------------
// Web entry points
// - Without ?action=…  → serves the form page (works on PC, as before).
// - With ?action=…     → JSON interface used by the standalone form page
//                        (GitHub Pages). That page opens on every phone,
//                        whatever Google accounts the browser is signed into.
//
// IMPORTANT: deploy with "Execute as: Me" and "Who has access: Anyone"
// (NOT "Anyone with Google account"), otherwise the JSON calls from the
// standalone page are redirected to a Google sign-in page and fail.
// ---------------------------------------------------------------------------
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.action) {
    return jsonResponse_(() => {
      switch (params.action) {
        case 'ping': return { ok: true, time: new Date().toISOString() };
        case 'data': return getSpreadsheetData();
        case 'mobile': return getMobileMessage(params.mobile, params.assembly);
        default: throw new Error('Άγνωστη ενέργεια: ' + params.action);
      }
    });
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Δήλωση Συμμετοχής στο Δείπνο — ΕΜΣΤΕ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  return jsonResponse_(() => {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action !== 'submit') throw new Error('Άγνωστη ενέργεια.');
    return processForm(body.form || {});
  });
}

function jsonResponse_(handler) {
  let payload;
  try {
    payload = { ok: true, result: handler() };
  } catch (error) {
    payload = { ok: false, error: String(error && error.message ? error.message : error) };
  }
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function ping() {
  return 'OK ' + new Date().toISOString();
}

function getSpreadsheetData() {
  const spreadsheet = getSpreadsheet_();
  const lodgeSheet = requireSheet_(spreadsheet, CONFIG.lodgesSheet);
  const rows = lodgeSheet.getLastRow() > 1
    ? lodgeSheet.getRange(2, 1, lodgeSheet.getLastRow() - 1, 3).getDisplayValues()
    : [];

  const lodges = rows
    .filter(row => String(row[0]).trim())
    .map((row, index) => ({
      lodge: String(row[0]).trim(),
      number: String(row[1]).trim() || LODGE_NUMBERS[index] || '',
      province: String(row[2]).trim()
    }));

  const textSheet = spreadsheet.getSheetByName(CONFIG.webTextSheet);
  const titles = textSheet && textSheet.getLastRow() > 1
    ? textSheet.getRange(2, 1, 1, Math.max(3, textSheet.getLastColumn())).getDisplayValues()
    : [];

  return { titles: titles, lodges: lodges };
}

function getMobileMessage(mobile, assembly) {
  const normalized = normalizeMobile_(mobile);
  validateMobile_(normalized);
  const spreadsheet = getSpreadsheet_();
  const responseSheet = getEventSheet_(spreadsheet, assembly, false);

  if (responseSheet && isMobileRegistered_(responseSheet, normalized)) {
    return { registered: true, message: '' };
  }

  const messageSheet = getFirstSheet_(spreadsheet, CONFIG.messageSheetCandidates);
  if (!messageSheet || messageSheet.getLastRow() < 2) {
    return { registered: false, message: '' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const values = messageSheet.getRange(2, 1, messageSheet.getLastRow() - 1, 4).getValues();
    for (let index = 0; index < values.length; index += 1) {
      if (normalizeMobile_(values[index][0]) !== normalized) continue;
      if (values[index][3]) return { registered: false, message: '' };

      const message = String(values[index][1] || '').trim();
      if (!message) return { registered: false, message: '' };

      messageSheet.getRange(index + 2, 4).setValue(new Date());
      SpreadsheetApp.flush();
      return { registered: false, message: message };
    }
  } finally {
    lock.releaseLock();
  }

  return { registered: false, message: '' };
}

function processForm(form) {
  const data = sanitizeForm_(form || {});
  validateForm_(data);

  const spreadsheet = getSpreadsheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let sheet;

  try {
    sheet = getEventSheet_(spreadsheet, data.assembly, true);
    if (isMobileRegistered_(sheet, data.mobile)) {
      throw new Error('DUPLICATE_MOBILE: Υπάρχει ήδη εγγραφή με αυτό το κινητό.');
    }

    sheet.appendRow([
      new Date(), data.name, data.surname, data.salutation,
      data.statusType + ' - ' + data.office,
      data.province, data.lodge, data.partner, data.mobile, data.email
    ]);
    SpreadsheetApp.flush();
    updateStatistics_(spreadsheet, data.assembly, sheet);
  } finally {
    lock.releaseLock();
  }

  let emailSent = false;
  let emailError = '';
  try {
    sendConfirmationEmail_(data);
    emailSent = true;
  } catch (error) {
    emailError = String(error && error.message ? error.message : error);
    console.error('Registration saved but email failed: ' + emailError);
  }

  notifyOrganizer_(data, emailSent, emailError);
  return { ok: true, emailSent: emailSent, emailError: emailError };
}

function sanitizeForm_(form) {
  return {
    assembly: clean_(form.assembly),
    name: clean_(form.name),
    surname: clean_(form.surname),
    salutation: clean_(form.salutation),
    statusType: clean_(form.statusType),
    office: clean_(form.office),
    province: clean_(form.province),
    lodge: clean_(form.lodge),
    partner: Math.max(0, parseInt(form.partner, 10) || 0),
    mobile: normalizeMobile_(form.mobile),
    email: clean_(form.email).toLowerCase()
  };
}

function validateForm_(data) {
  if (!CONFIG.eventSheets[data.assembly]) throw new Error('Παρακαλούμε επιλέξτε Μεγάλη Συνέλευση.');
  ['name','surname','salutation','statusType','office','province','lodge','email'].forEach(key => {
    if (!data[key]) throw new Error('Λείπει το υποχρεωτικό πεδίο: ' + key);
  });
  if (!PROVINCES.includes(data.province)) throw new Error('Μη έγκυρη Επαρχία / Περιφέρεια.');
  validateMobile_(data.mobile);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new Error('Μη έγκυρη διεύθυνση email.');
}

function sendConfirmationEmail_(data) {
  const event = EVENT_DETAILS[data.assembly];
  const subject = 'Επιβεβαίωση Εγγραφής ' + data.salutation + ' ' + data.name + ' ' + data.surname + ' στο ' + event.dinner.replace(/^το /, '');
  const rows = [
    ['Μεγάλη Συνέλευση', event.title],
    ['Ονοματεπώνυμο', data.name + ' ' + data.surname],
    ['Προσφώνηση', data.salutation],
    ['Κατάσταση / Αξίωμα', data.statusType + ' - ' + data.office],
    ['Επαρχία / Περιφέρεια', data.province],
    ['Στοά', data.lodge],
    ['Συνοδοί στο δείπνο', String(data.partner)],
    ['Κινητό', data.mobile],
    ['Email', data.email]
  ];
  const tableRows = rows.map(row =>
    '<tr><th style="padding:9px;border:1px solid #d0aa4f;background:#f5ecd5;text-align:left">' + escapeHtml_(row[0]) + '</th>' +
    '<td style="padding:9px;border:1px solid #d0aa4f">' + escapeHtml_(row[1]) + '</td></tr>'
  ).join('');

  const html = '<div style="max-width:680px;margin:auto;font-family:Arial,sans-serif;color:#061a35">' +
    '<div style="padding:24px;background:#123f78;color:white;text-align:center;border-bottom:4px solid #d0aa4f">' +
    '<h1 style="margin:0;font-size:23px">ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ ΤΗΣ ΕΛΛΑΔΟΣ</h1></div>' +
    '<div style="padding:28px;border:1px solid #d0aa4f">' +
    '<h2>Ευχαριστούμε για τη δήλωση συμμετοχής</h2>' +
    '<p>Αγαπητέ ' + escapeHtml_(data.salutation + ' ' + data.name + ' ' + data.surname) + ',</p>' +
    '<p>Η εγγραφή σας καταχωρίστηκε επιτυχώς.</p>' +
    '<div style="margin:18px 0;padding:14px;border:2px solid #a32626;background:#fff0e8;color:#861c1c;font-weight:bold">' +
    'ΠΡΟΣΟΧΗ: Η ΔΗΛΩΣΗ ΣΥΜΜΕΤΟΧΗΣ ΑΦΟΡΑ ΤΟ ΔΕΙΠΝΟ ΚΑΙ ΟΧΙ ΤΗ ΜΕΓΑΛΗ ΣΥΝΕΛΕΥΣΗ.</div>' +
    '<table style="width:100%;border-collapse:collapse">' + tableRows + '</table>' +
    '<p style="margin-top:25px">Για τη Διοργάνωση<br>Ο Μέγας Γραμματεύς<br><strong>Πσεβ. Αδ. Δημήτριος Σκιαδόπουλος</strong></p>' +
    '</div></div>';

  const plain = 'Αγαπητέ ' + data.salutation + ' ' + data.name + ' ' + data.surname + ',\n\n' +
    'Η εγγραφή σας καταχωρίστηκε επιτυχώς για ' + event.dinner + '.\n\n' +
    'ΠΡΟΣΟΧΗ: Η ΔΗΛΩΣΗ ΣΥΜΜΕΤΟΧΗΣ ΑΦΟΡΑ ΤΟ ΔΕΙΠΝΟ ΚΑΙ ΟΧΙ ΤΗ ΜΕΓΑΛΗ ΣΥΝΕΛΕΥΣΗ.\n\n' +
    'Για τη Διοργάνωση\nΟ Μέγας Γραμματεύς\nΠσεβ. Αδ. Δημήτριος Σκιαδόπουλος';

  MailApp.sendEmail({ to: data.email, subject: subject, body: plain, htmlBody: html, name: 'Εθνική Μεγάλη Στοά της Ελλάδος' });
}

function notifyOrganizer_(data, emailSent, emailError) {
  const recipient = PropertiesService.getScriptProperties().getProperty(CONFIG.organizerEmailProperty);
  if (!recipient) return;
  const event = EVENT_DETAILS[data.assembly];
  const status = emailSent ? 'Η επιβεβαίωση email στάλθηκε.' : 'Η επιβεβαίωση email απέτυχε: ' + emailError;
  try {
    MailApp.sendEmail(recipient, 'Νέα εγγραφή δείπνου — ' + data.name + ' ' + data.surname,
      event.title + '\n' + data.name + ' ' + data.surname + '\n' + data.mobile + '\n' + data.email + '\n\n' + status);
  } catch (error) {
    console.error('Organizer notification failed: ' + error);
  }
}

function updateStatistics_(spreadsheet, assembly, responseSheet) {
  let statistics = spreadsheet.getSheetByName(CONFIG.statisticsSheet);
  if (!statistics) statistics = spreadsheet.insertSheet(CONFIG.statisticsSheet);

  const values = responseSheet.getLastRow() > 1
    ? responseSheet.getRange(2, 1, responseSheet.getLastRow() - 1, RESPONSE_HEADERS.length).getDisplayValues()
    : [];
  const headerMap = headerMap_(responseSheet);
  const provinceIndex = requiredHeaderIndex_(headerMap, ['province']);
  const lodgeIndex = requiredHeaderIndex_(headerMap, ['lodge']);
  const partnerIndex = requiredHeaderIndex_(headerMap, ['partner']);
  const brothers = values.filter(row => row.some(Boolean)).length;
  const guests = values.reduce((sum, row) => sum + (parseInt(row[partnerIndex], 10) || 0), 0);
  const provinceCounts = Object.fromEntries(PROVINCES.map(province => [province, 0]));
  const lodgeCounts = {};
  values.forEach(row => {
    const province = String(row[provinceIndex] || '').trim();
    const lodge = String(row[lodgeIndex] || '').trim();
    if (Object.prototype.hasOwnProperty.call(provinceCounts, province)) provinceCounts[province] += 1;
    if (lodge) lodgeCounts[lodge] = (lodgeCounts[lodge] || 0) + 1;
  });
  const strongest = Object.keys(lodgeCounts).sort((a, b) => lodgeCounts[b] - lodgeCounts[a] || a.localeCompare(b, 'el'))[0] || '—';
  const output = [
    ['Στατιστικά — ' + EVENT_DETAILS[assembly].title, 'Πλήθος'],
    ['Συνολικές συμμετοχές', brothers + guests],
    ['Συμμετοχές Αδελφών', brothers],
    ['Συμμετοχές Συνοδών', guests],
    ['ανά Επαρχία', ''],
    ...PROVINCES.map(province => [province, provinceCounts[province]]),
    ['Η πιο δυναμική Στοά', strongest === '—' ? strongest : strongest + ' (' + lodgeCounts[strongest] + ')']
  ];
  const startColumn = assembly === 'dec2026' ? 1 : 4;
  statistics.getRange(1, startColumn, statistics.getMaxRows(), 2).clearContent();
  statistics.getRange(1, startColumn, output.length, 2).setValues(output);
  statistics.getRange(1, startColumn, 1, 2).setFontWeight('bold').setBackground('#123f78').setFontColor('#ffffff');
  statistics.autoResizeColumns(startColumn, 2);
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(CONFIG.spreadsheetProperty);
  if (id) return SpreadsheetApp.openById(id.trim());
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('Δεν έχει οριστεί SPREADSHEET_ID στις Ιδιότητες σεναρίου.');
}

function getEventSheet_(spreadsheet, assembly, createIfMissing) {
  const name = CONFIG.eventSheets[assembly];
  if (!name) throw new Error('Μη έγκυρη επιλογή Μεγάλης Συνέλευσης.');
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet && createIfMissing) {
    sheet = spreadsheet.insertSheet(name);
    sheet.getRange(1, 1, 1, RESPONSE_HEADERS.length).setValues([RESPONSE_HEADERS]).setFontWeight('bold');
  }
  if (sheet && sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, RESPONSE_HEADERS.length).setValues([RESPONSE_HEADERS]).setFontWeight('bold');
  }
  return sheet;
}

function isMobileRegistered_(sheet, mobile) {
  if (!sheet || sheet.getLastRow() < 2) return false;
  const map = headerMap_(sheet);
  const mobileIndex = requiredHeaderIndex_(map, ['mobile', 'κινητό', 'κινητο']);
  return sheet.getRange(2, mobileIndex + 1, sheet.getLastRow() - 1, 1).getDisplayValues()
    .some(row => normalizeMobile_(row[0]) === mobile);
}

function headerMap_(sheet) {
  const width = Math.max(RESPONSE_HEADERS.length, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  const map = {};
  headers.forEach((header, index) => { map[normalizeHeader_(header)] = index; });
  return map;
}

function requiredHeaderIndex_(map, candidates) {
  for (const candidate of candidates) {
    const key = normalizeHeader_(candidate);
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  }
  throw new Error('Δεν βρέθηκε απαιτούμενη στήλη: ' + candidates.join(' / '));
}

function normalizeHeader_(value) {
  return String(value || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeMobile_(value) {
  return String(value || '').replace(/\D/g, '').replace(/^30(?=69\d{8}$)/, '');
}

function validateMobile_(mobile) {
  if (!/^69\d{8}$/.test(mobile)) throw new Error('INVALID_MOBILE: Μη έγκυρο ελληνικό κινητό.');
}

function clean_(value) {
  return String(value == null ? '' : value).trim();
}

function requireSheet_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error('Δεν βρέθηκε το φύλλο "' + name + '".');
  return sheet;
}

function getFirstSheet_(spreadsheet, names) {
  for (const name of names) {
    const sheet = spreadsheet.getSheetByName(name);
    if (sheet) return sheet;
  }
  return null;
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
