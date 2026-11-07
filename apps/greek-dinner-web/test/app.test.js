'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { buildConfirmationEmail } = require('../src/mail');

function fakeMailer({ fail = false } = {}) {
  const sent = [];
  return {
    sent,
    configured: true,
    async sendConfirmation(data) {
      if (fail) throw new Error('smtp down');
      sent.push(buildConfirmationEmail(data));
    },
    async notifyOrganizer() {}
  };
}

async function start(options = {}) {
  const repo = openDatabase(':memory:');
  const mailer = fakeMailer(options);
  const app = createApp({ repo, mailer, env: { ADMIN_PASSWORD: 'secret-pass', SESSION_SECRET: 'x'.repeat(32) } });
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (path, { method = 'GET', body, cookie } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: response.status, json, text, headers: response.headers };
  };
  const login = async () => {
    const res = await call('/api/admin/login', { method: 'POST', body: { password: 'secret-pass' } });
    assert.equal(res.status, 200);
    return res.headers.get('set-cookie').split(';')[0];
  };
  return { repo, mailer, call, login, close: () => server.close() };
}

const registration = {
  assembly: 'dec2026', name: 'Γεώργιος', surname: 'Παπαδόπουλος', salutation: 'Αδελφέ',
  statusType: 'ΟΥΔΕΝ', office: 'ΟΥΔΕΝ', province: 'ΑΘΗΝΩΝ', lodge: 'ΑΚΡΟΠΟΛΙΣ υπ’ αριθμ. 2',
  partner: '1', mobile: '+30 691 234 5678', email: 'Test@Example.com'
};

test('serves the lodge list seeded from the original form', async t => {
  const app = await start(); t.after(app.close);
  const res = await app.call('/api/config');
  assert.equal(res.status, 200);
  assert.equal(res.json.lodges.length, 86);
  assert.deepEqual(res.json.lodges[1], { lodge: 'ΑΚΡΟΠΟΛΙΣ', number: '2', province: 'ΑΘΗΝΩΝ' });
});

test('saves a registration, sends the same confirmation email and blocks duplicates', async t => {
  const app = await start(); t.after(app.close);
  const res = await app.call('/api/register', { method: 'POST', body: registration });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { ok: true, emailSent: true, emailError: '' });

  const [mail] = app.mailer.sent;
  assert.equal(mail.to, 'test@example.com');
  assert.equal(mail.subject, 'Επιβεβαίωση Εγγραφής Αδελφέ Γεώργιος Παπαδόπουλος στο δείπνο της 19ης Δεκ στην Κέρκυρα');
  assert.match(mail.html, /ΠΡΟΣΟΧΗ: Η ΔΗΛΩΣΗ ΣΥΜΜΕΤΟΧΗΣ ΑΦΟΡΑ ΤΟ ΔΕΙΠΝΟ/);
  assert.match(mail.html, /6912345678/);

  const dup = await app.call('/api/register', { method: 'POST', body: registration });
  assert.equal(dup.status, 409);
  assert.match(dup.json.error, /DUPLICATE_MOBILE/);

  const check = await app.call('/api/mobile-check', { method: 'POST', body: { mobile: '6912345678', assembly: 'dec2026' } });
  assert.deepEqual(check.json, { registered: true, message: '' });

  // The same mobile may register for the other event.
  const may = await app.call('/api/register', { method: 'POST', body: { ...registration, assembly: 'may2027' } });
  assert.equal(may.status, 200);
});

test('keeps the registration when email delivery fails', async t => {
  const app = await start({ fail: true }); t.after(app.close);
  const res = await app.call('/api/register', { method: 'POST', body: registration });
  assert.equal(res.status, 200);
  assert.equal(res.json.emailSent, false);
  const [row] = app.repo.listRegistrations('dec2026');
  assert.equal(row.email_status, 'failed');
});

test('rejects invalid input', async t => {
  const app = await start(); t.after(app.close);
  const bad = await app.call('/api/register', { method: 'POST', body: { ...registration, mobile: '2101234567' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.code, 'INVALID_MOBILE');
  const badProvince = await app.call('/api/register', { method: 'POST', body: { ...registration, province: 'X' } });
  assert.equal(badProvince.status, 400);
});

test('shows a personal message only once', async t => {
  const app = await start(); t.after(app.close);
  app.repo.upsertMessage('6900000001', 'Καλώς ήρθατε!');
  const body = { mobile: '6900000001', assembly: 'dec2026' };
  assert.equal((await app.call('/api/mobile-check', { method: 'POST', body })).json.message, 'Καλώς ήρθατε!');
  assert.equal((await app.call('/api/mobile-check', { method: 'POST', body })).json.message, '');
});

test('admin endpoints require the admin password', async t => {
  const app = await start(); t.after(app.close);
  assert.equal((await app.call('/api/admin/registrations')).status, 401);
  assert.equal((await app.call('/api/admin/export.csv')).status, 401);
  assert.equal((await app.call('/api/admin/login', { method: 'POST', body: { password: 'wrong' } })).status, 401);
  const forged = 'nglg_admin=' + (Date.now() + 1e7) + '.forged';
  assert.equal((await app.call('/api/admin/registrations', { cookie: forged })).status, 401);
});

test('admin can list, edit, export, resend and delete registrations', async t => {
  const app = await start(); t.after(app.close);
  await app.call('/api/register', { method: 'POST', body: registration });
  const cookie = await app.login();

  const list = await app.call('/api/admin/registrations?event=dec2026', { cookie });
  assert.equal(list.json.length, 1);
  const id = list.json[0].id;

  const edit = await app.call('/api/admin/registrations/' + id, {
    method: 'PUT', cookie, body: { ...registration, event: 'dec2026', partner: 3, notes: 'Τραπέζι 4' }
  });
  assert.equal(edit.status, 200);
  assert.equal(edit.json.partner, 3);
  assert.equal(edit.json.notes, 'Τραπέζι 4');

  const stats = await app.call('/api/admin/statistics', { cookie });
  assert.equal(stats.json[0].total, 4);
  assert.equal(stats.json[0].provinces['ΑΘΗΝΩΝ'], 1);

  const csv = await app.call('/api/admin/export.csv?event=dec2026', { cookie });
  assert.match(csv.text, /Παπαδόπουλος/);
  assert.match(csv.text, /ΟΥΔΕΝ - ΟΥΔΕΝ/);

  const resend = await app.call('/api/admin/registrations/' + id + '/send-email', { method: 'POST', cookie });
  assert.equal(resend.json.emailSent, true);
  assert.equal(app.mailer.sent.length, 2);

  assert.equal((await app.call('/api/admin/registrations/' + id, { method: 'DELETE', cookie })).status, 200);
  assert.equal((await app.call('/api/admin/registrations?event=dec2026', { cookie })).json.length, 0);
});

test('CSV export neutralises spreadsheet formulas', async t => {
  const app = await start(); t.after(app.close);
  await app.call('/api/register', { method: 'POST', body: { ...registration, name: '=HYPERLINK("x")' } });
  const cookie = await app.login();
  const csv = await app.call('/api/admin/export.csv', { cookie });
  assert.match(csv.text, /"'=HYPERLINK\(""x""\)"/);
});
