'use strict';

// Values copied from the Apps Script version (forms/greek-grand-communication/Code.gs).

const EVENTS = Object.freeze({
  dec2026: {
    title: 'Μεγάλη Συνέλευση 19ης Δεκεμβρίου 2026',
    dinner: 'το δείπνο της 19ης Δεκ στην Κέρκυρα',
    sheetName: 'DEC 2026'
  },
  may2027: {
    title: 'Μεγάλη Συνέλευση 15ης Μαΐου 2027',
    dinner: 'το δείπνο της 15ης Μαΐου 2027',
    sheetName: 'MAY 2027'
  }
});

const PROVINCES = Object.freeze([
  'ΑΘΗΝΩΝ',
  'ΠΕΙΡΑΙΩΣ & ΑΙΓΑΙΟΥ',
  'ΙΟΝΙΩΝ ΝΗΣΩΝ',
  'ΔΥΤΙΚΗΣ ΕΛΛΑΔΟΣ',
  'ΚΕΝΤΡΙΚΗΣ & ΒΟΡΕΙΟΥ ΕΛΛΑΔΟΣ',
  'ΚΥΠΡΟΥ'
]);

const SALUTATIONS = Object.freeze(['Σεβασμιότατε', 'Πανσεβάσμιε', 'Λίαν Σεβάσμιε', 'Σεβάσμιε', 'Αδελφέ']);
const STATUS_TYPES = Object.freeze(['ΕΝ ΕΝΕΡΓΕΙΑ', 'ΠΡΩΗΝ', 'ΟΥΔΕΝ']);

function normalizeMobile(value) {
  return String(value || '').replace(/\D/g, '').replace(/^30(?=69\d{8}$)/, '');
}

function isValidMobile(mobile) {
  return /^69\d{8}$/.test(mobile);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clean(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = {
  EVENTS, PROVINCES, SALUTATIONS, STATUS_TYPES,
  normalizeMobile, isValidMobile, isValidEmail, clean, escapeHtml
};
