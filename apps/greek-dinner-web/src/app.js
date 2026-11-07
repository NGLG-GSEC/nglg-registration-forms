'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const {
  EVENTS, PROVINCES, normalizeMobile, isValidMobile, isValidEmail, clean
} = require('./constants');

const SESSION_COOKIE = 'nglg_admin';
const SESSION_HOURS = 12;

function createApp({ repo, mailer, env = process.env }) {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY === 'true' ? true : env.TRUST_PROXY);

  const sessionSecret = env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  const adminPassword = env.ADMIN_PASSWORD || '';
  if (!adminPassword) console.warn('ADMIN_PASSWORD is not set: the admin panel is locked.');

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    });
    next();
  });
  app.use(express.json({ limit: '32kb' }));

  // ---------- helpers ----------
  const limiters = new Map();
  function rateLimit(name, max, windowMs) {
    return (req, res, next) => {
      const key = name + '|' + req.ip;
      const now = Date.now();
      const entry = limiters.get(key);
      if (!entry || entry.reset < now) {
        limiters.set(key, { count: 1, reset: now + windowMs });
        return next();
      }
      entry.count += 1;
      if (entry.count > max) return res.status(429).json({ error: 'Πάρα πολλές προσπάθειες. Δοκιμάστε ξανά σε λίγα λεπτά.' });
      next();
    };
  }
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of limiters) if (entry.reset < now) limiters.delete(key);
  }, 60_000).unref();

  function sign(value) {
    return crypto.createHmac('sha256', sessionSecret).update(value).digest('base64url');
  }
  function safeEqual(a, b) {
    const ab = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
  }
  function readCookie(req, name) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
      const index = part.indexOf('=');
      if (index > -1 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
    }
    return '';
  }
  function isAdmin(req) {
    const token = readCookie(req, SESSION_COOKIE);
    const [expires, signature] = token.split('.');
    if (!expires || !signature || !safeEqual(sign(expires), signature)) return false;
    return Number(expires) > Date.now();
  }
  function requireAdmin(req, res, next) {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Απαιτείται σύνδεση διαχειριστή.' });
    next();
  }
  function cookieFlags(req) {
    return 'Path=/; HttpOnly; SameSite=Strict' + (req.secure ? '; Secure' : '');
  }

  function parseRegistration(body, { admin = false } = {}) {
    const data = {
      event: clean(body.assembly || body.event),
      name: clean(body.name),
      surname: clean(body.surname),
      salutation: clean(body.salutation),
      statusType: clean(body.statusType),
      office: clean(body.office),
      province: clean(body.province),
      lodge: clean(body.lodge),
      partner: Math.min(50, Math.max(0, parseInt(body.partner, 10) || 0)),
      mobile: normalizeMobile(body.mobile),
      email: clean(body.email).toLowerCase(),
      notes: admin ? clean(body.notes, 1000) : ''
    };
    if (!EVENTS[data.event]) return { error: 'Παρακαλούμε επιλέξτε Μεγάλη Συνέλευση.' };
    for (const key of ['name', 'surname', 'salutation', 'statusType', 'office', 'province', 'lodge', 'email']) {
      if (!data[key]) return { error: 'Λείπει το υποχρεωτικό πεδίο: ' + key };
    }
    if (!PROVINCES.includes(data.province)) return { error: 'Μη έγκυρη Επαρχία / Περιφέρεια.' };
    if (!isValidMobile(data.mobile)) return { error: 'INVALID_MOBILE: Μη έγκυρο ελληνικό κινητό.', code: 'INVALID_MOBILE' };
    if (!isValidEmail(data.email)) return { error: 'Μη έγκυρη διεύθυνση email.' };
    return { data };
  }

  async function deliverConfirmation(row, data) {
    let emailSent = false;
    let emailError = '';
    try {
      await mailer.sendConfirmation(data);
      emailSent = true;
      repo.setEmailStatus(row.id, 'sent');
    } catch (error) {
      emailError = String(error && error.message ? error.message : error);
      repo.setEmailStatus(row.id, 'failed', emailError);
      console.error('Registration ' + row.id + ' saved but email failed: ' + emailError);
    }
    return { emailSent, emailError };
  }

  function rowToData(row) {
    return {
      event: row.event, name: row.name, surname: row.surname, salutation: row.salutation,
      statusType: row.status_type, office: row.office, province: row.province, lodge: row.lodge,
      partner: row.partner, mobile: row.mobile, email: row.email
    };
  }

  // ---------- public API ----------
  app.get('/api/config', (req, res) => {
    res.json({
      events: Object.entries(EVENTS).map(([id, e]) => ({ id, title: e.title })),
      lodges: repo.listLodges().map(l => ({ lodge: l.lodge, number: l.number, province: l.province }))
    });
  });

  app.post('/api/mobile-check', rateLimit('mobile', 60, 10 * 60_000), (req, res) => {
    const mobile = normalizeMobile(req.body && req.body.mobile);
    const event = clean(req.body && req.body.assembly);
    if (!isValidMobile(mobile)) return res.status(400).json({ error: 'INVALID_MOBILE: Μη έγκυρο ελληνικό κινητό.', code: 'INVALID_MOBILE' });
    if (!EVENTS[event]) return res.status(400).json({ error: 'Παρακαλούμε επιλέξτε Μεγάλη Συνέλευση.' });
    if (repo.isRegistered(event, mobile)) return res.json({ registered: true, message: '' });
    res.json({ registered: false, message: repo.takePersonalMessage(mobile) });
  });

  app.post('/api/register', rateLimit('register', 20, 10 * 60_000), async (req, res) => {
    const parsed = parseRegistration(req.body || {});
    if (parsed.error) return res.status(400).json({ error: parsed.error, code: parsed.code });
    const row = repo.createRegistration(parsed.data);
    if (!row) {
      return res.status(409).json({ error: 'DUPLICATE_MOBILE: Υπάρχει ήδη εγγραφή με αυτό το κινητό.', code: 'DUPLICATE_MOBILE' });
    }
    // The registration is stored before the email is attempted, as in the original.
    const { emailSent, emailError } = await deliverConfirmation(row, parsed.data);
    mailer.notifyOrganizer(parsed.data, emailSent, emailError);
    res.json({ ok: true, emailSent, emailError: emailSent ? '' : 'Το email επιβεβαίωσης δεν στάλθηκε.' });
  });

  // ---------- admin auth ----------
  app.post('/api/admin/login', rateLimit('login', 10, 15 * 60_000), (req, res) => {
    const password = String((req.body && req.body.password) || '');
    if (!adminPassword || !safeEqual(sign('pw:' + password), sign('pw:' + adminPassword))) {
      return res.status(401).json({ error: 'Λάθος κωδικός.' });
    }
    const expires = String(Date.now() + SESSION_HOURS * 3600_000);
    res.set('Set-Cookie', SESSION_COOKIE + '=' + expires + '.' + sign(expires) + '; Max-Age=' + SESSION_HOURS * 3600 + '; ' + cookieFlags(req));
    res.json({ ok: true });
  });
  app.post('/api/admin/logout', (req, res) => {
    res.set('Set-Cookie', SESSION_COOKIE + '=; Max-Age=0; ' + cookieFlags(req));
    res.json({ ok: true });
  });
  app.get('/api/admin/session', (req, res) => res.json({ admin: isAdmin(req), emailConfigured: mailer.configured }));

  // ---------- admin data ----------
  const admin = express.Router();
  admin.use(requireAdmin);
  admin.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  admin.get('/registrations', (req, res) => {
    const event = clean(req.query.event);
    res.json(repo.listRegistrations(EVENTS[event] ? event : ''));
  });
  admin.post('/registrations', (req, res) => {
    const parsed = parseRegistration(req.body || {}, { admin: true });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const row = repo.createRegistration(parsed.data);
    if (!row) return res.status(409).json({ error: 'Υπάρχει ήδη εγγραφή με αυτό το κινητό για αυτή τη Συνέλευση.' });
    if (parsed.data.notes) repo.updateRegistration(row.id, parsed.data);
    repo.setEmailStatus(row.id, 'not sent (admin entry)');
    res.status(201).json(repo.getRegistration(row.id));
  });
  admin.put('/registrations/:id', (req, res) => {
    const parsed = parseRegistration(req.body || {}, { admin: true });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const row = repo.updateRegistration(Number(req.params.id), parsed.data);
    if (row === null) return res.status(409).json({ error: 'Υπάρχει ήδη εγγραφή με αυτό το κινητό για αυτή τη Συνέλευση.' });
    if (!row) return res.status(404).json({ error: 'Η εγγραφή δεν βρέθηκε.' });
    res.json(row);
  });
  admin.delete('/registrations/:id', (req, res) => {
    if (!repo.deleteRegistration(Number(req.params.id))) return res.status(404).json({ error: 'Η εγγραφή δεν βρέθηκε.' });
    res.json({ ok: true });
  });
  admin.post('/registrations/:id/send-email', async (req, res) => {
    const row = repo.getRegistration(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Η εγγραφή δεν βρέθηκε.' });
    const result = await deliverConfirmation(row, rowToData(row));
    res.json({ ...result, registration: repo.getRegistration(row.id) });
  });

  admin.get('/statistics', (req, res) => {
    res.json(Object.keys(EVENTS).map(event => repo.statistics(event)));
  });

  admin.get('/export.csv', (req, res) => {
    const event = clean(req.query.event);
    const rows = repo.listRegistrations(EVENTS[event] ? event : '');
    const header = ['event', 'register day', 'name', 'surname', 'Salutation', 'Office', 'Province', 'Lodge',
      'Partner', 'mobile', 'email', 'email status', 'notes'];
    const csvCell = value => {
      let text = String(value == null ? '' : value);
      if (/^[=+\-@\t\r]/.test(text)) text = "'" + text; // block spreadsheet formula injection
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const lines = [header.map(csvCell).join(',')].concat(rows.map(r => [
      EVENTS[r.event] ? EVENTS[r.event].sheetName : r.event,
      new Date(r.registered_at).toLocaleString('el-GR', { timeZone: 'Europe/Athens' }),
      r.name, r.surname, r.salutation, r.status_type + ' - ' + r.office, r.province, r.lodge,
      r.partner, r.mobile, r.email, r.email_status, r.notes
    ].map(csvCell).join(',')));
    const fileName = 'registrations-' + (EVENTS[event] ? EVENTS[event].sheetName.replace(' ', '-') : 'all') + '.csv';
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="' + fileName + '"' });
    res.send('﻿' + lines.join('\r\n'));
  });

  function parseLodge(body) {
    const lodge = { lodge: clean(body.lodge), number: clean(body.number, 20), province: clean(body.province) };
    if (!lodge.lodge) return { error: 'Λείπει το όνομα της Στοάς.' };
    if (!PROVINCES.includes(lodge.province)) return { error: 'Μη έγκυρη Επαρχία / Περιφέρεια.' };
    return { lodge };
  }
  admin.get('/lodges', (req, res) => res.json(repo.listLodges()));
  admin.post('/lodges', (req, res) => {
    const parsed = parseLodge(req.body || {});
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    res.status(201).json({ id: repo.createLodge(parsed.lodge) });
  });
  admin.put('/lodges/:id', (req, res) => {
    const parsed = parseLodge(req.body || {});
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (!repo.updateLodge(Number(req.params.id), parsed.lodge)) return res.status(404).json({ error: 'Δεν βρέθηκε.' });
    res.json({ ok: true });
  });
  admin.delete('/lodges/:id', (req, res) => {
    if (!repo.deleteLodge(Number(req.params.id))) return res.status(404).json({ error: 'Δεν βρέθηκε.' });
    res.json({ ok: true });
  });

  admin.get('/messages', (req, res) => res.json(repo.listMessages()));
  admin.put('/messages/:mobile', (req, res) => {
    const mobile = normalizeMobile(req.params.mobile);
    const message = clean(req.body && req.body.message, 2000);
    if (!isValidMobile(mobile)) return res.status(400).json({ error: 'Μη έγκυρο ελληνικό κινητό.' });
    if (!message) return res.status(400).json({ error: 'Λείπει το μήνυμα.' });
    repo.upsertMessage(mobile, message);
    res.json({ ok: true });
  });
  admin.post('/messages/:mobile/reset', (req, res) => {
    if (!repo.resetMessage(normalizeMobile(req.params.mobile))) return res.status(404).json({ error: 'Δεν βρέθηκε.' });
    res.json({ ok: true });
  });
  admin.delete('/messages/:mobile', (req, res) => {
    if (!repo.deleteMessage(normalizeMobile(req.params.mobile))) return res.status(404).json({ error: 'Δεν βρέθηκε.' });
    res.json({ ok: true });
  });

  app.use('/api/admin', admin);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // ---------- pages ----------
  const publicDir = path.join(__dirname, '..', 'public');
  app.get('/admin', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(publicDir, 'admin.html'));
  });
  app.use('/assets', express.static(path.join(publicDir, 'assets'), { maxAge: '7d' }));
  app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.use((error, req, res, next) => { // eslint-disable-line no-unused-vars
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Μη έγκυρα δεδομένα.' });
    console.error(error);
    res.status(500).json({ error: 'Παρουσιάστηκε σφάλμα στον διακομιστή.' });
  });

  return app;
}

module.exports = { createApp };
