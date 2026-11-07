'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { EVENTS, PROVINCES, normalizeMobile } = require('./constants');

function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS registrations (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      event        TEXT NOT NULL,
      registered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      name         TEXT NOT NULL,
      surname      TEXT NOT NULL,
      salutation   TEXT NOT NULL,
      status_type  TEXT NOT NULL,
      office       TEXT NOT NULL,
      province     TEXT NOT NULL,
      lodge        TEXT NOT NULL,
      partner      INTEGER NOT NULL DEFAULT 0,
      mobile       TEXT NOT NULL,
      email        TEXT NOT NULL,
      email_status TEXT NOT NULL DEFAULT 'pending',
      email_error  TEXT NOT NULL DEFAULT '',
      notes        TEXT NOT NULL DEFAULT '',
      updated_at   TEXT,
      UNIQUE (event, mobile)
    );

    CREATE TABLE IF NOT EXISTS lodges (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      position INTEGER NOT NULL DEFAULT 0,
      lodge    TEXT NOT NULL,
      number   TEXT NOT NULL DEFAULT '',
      province TEXT NOT NULL
    );

    -- Replaces the private "cover" worksheet: mobile -> one-time personal message.
    CREATE TABLE IF NOT EXISTS personal_messages (
      mobile   TEXT PRIMARY KEY,
      message  TEXT NOT NULL,
      shown_at TEXT
    );
  `);

  const lodgeCount = db.prepare('SELECT COUNT(*) AS n FROM lodges').get().n;
  if (lodgeCount === 0) {
    const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-lodges.json'), 'utf8'));
    const insert = db.prepare('INSERT INTO lodges (position, lodge, number, province) VALUES (?, ?, ?, ?)');
    db.exec('BEGIN');
    seed.forEach((item, index) => insert.run(index, item.lodge, item.number, item.province));
    db.exec('COMMIT');
  }

  return createRepository(db);
}

function createRepository(db) {
  const q = {
    isRegistered: db.prepare('SELECT 1 FROM registrations WHERE event = ? AND mobile = ?'),
    insert: db.prepare(`INSERT INTO registrations
      (event, name, surname, salutation, status_type, office, province, lodge, partner, mobile, email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    setEmailStatus: db.prepare('UPDATE registrations SET email_status = ?, email_error = ? WHERE id = ?'),
    getById: db.prepare('SELECT * FROM registrations WHERE id = ?'),
    listByEvent: db.prepare('SELECT * FROM registrations WHERE event = ? ORDER BY registered_at, id'),
    listAll: db.prepare('SELECT * FROM registrations ORDER BY event, registered_at, id'),
    update: db.prepare(`UPDATE registrations SET
      event = ?, name = ?, surname = ?, salutation = ?, status_type = ?, office = ?, province = ?,
      lodge = ?, partner = ?, mobile = ?, email = ?, notes = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?`),
    remove: db.prepare('DELETE FROM registrations WHERE id = ?'),

    lodges: db.prepare('SELECT * FROM lodges ORDER BY position, id'),
    insertLodge: db.prepare('INSERT INTO lodges (position, lodge, number, province) VALUES ((SELECT COALESCE(MAX(position),0)+1 FROM lodges), ?, ?, ?)'),
    updateLodge: db.prepare('UPDATE lodges SET lodge = ?, number = ?, province = ? WHERE id = ?'),
    removeLodge: db.prepare('DELETE FROM lodges WHERE id = ?'),

    message: db.prepare('SELECT * FROM personal_messages WHERE mobile = ?'),
    markShown: db.prepare("UPDATE personal_messages SET shown_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE mobile = ? AND shown_at IS NULL"),
    messages: db.prepare('SELECT * FROM personal_messages ORDER BY mobile'),
    upsertMessage: db.prepare(`INSERT INTO personal_messages (mobile, message) VALUES (?, ?)
      ON CONFLICT(mobile) DO UPDATE SET message = excluded.message`),
    resetMessage: db.prepare('UPDATE personal_messages SET shown_at = NULL WHERE mobile = ?'),
    removeMessage: db.prepare('DELETE FROM personal_messages WHERE mobile = ?')
  };

  return {
    raw: db,

    isRegistered(event, mobile) {
      return Boolean(q.isRegistered.get(event, mobile));
    },

    /** Returns the new row, or null if this mobile is already registered for the event. */
    createRegistration(data) {
      try {
        const result = q.insert.run(data.event, data.name, data.surname, data.salutation, data.statusType,
          data.office, data.province, data.lodge, data.partner, data.mobile, data.email);
        return q.getById.get(Number(result.lastInsertRowid));
      } catch (error) {
        if (/UNIQUE constraint failed/.test(String(error.message))) return null;
        throw error;
      }
    },

    setEmailStatus(id, status, error = '') {
      q.setEmailStatus.run(status, String(error).slice(0, 500), id);
    },

    getRegistration(id) {
      return q.getById.get(id) || null;
    },

    listRegistrations(event) {
      return event ? q.listByEvent.all(event) : q.listAll.all();
    },

    updateRegistration(id, data) {
      try {
        const result = q.update.run(data.event, data.name, data.surname, data.salutation, data.statusType,
          data.office, data.province, data.lodge, data.partner, data.mobile, data.email, data.notes || '', id);
        return result.changes > 0 ? q.getById.get(id) : undefined;
      } catch (error) {
        if (/UNIQUE constraint failed/.test(String(error.message))) return null;
        throw error;
      }
    },

    deleteRegistration(id) {
      return q.remove.run(id).changes > 0;
    },

    /** Same figures as the "Στατιστικά" worksheet of the Apps Script version. */
    statistics(event) {
      const rows = q.listByEvent.all(event);
      const brothers = rows.length;
      const guests = rows.reduce((sum, row) => sum + (Number(row.partner) || 0), 0);
      const provinces = Object.fromEntries(PROVINCES.map(p => [p, 0]));
      const lodges = {};
      rows.forEach(row => {
        if (Object.prototype.hasOwnProperty.call(provinces, row.province)) provinces[row.province] += 1;
        if (row.lodge) lodges[row.lodge] = (lodges[row.lodge] || 0) + 1;
      });
      const strongest = Object.keys(lodges)
        .sort((a, b) => lodges[b] - lodges[a] || a.localeCompare(b, 'el'))[0] || null;
      return {
        event,
        title: EVENTS[event] ? EVENTS[event].title : event,
        total: brothers + guests,
        brothers,
        guests,
        provinces,
        strongestLodge: strongest ? { lodge: strongest, count: lodges[strongest] } : null
      };
    },

    listLodges() { return q.lodges.all(); },
    createLodge(l) { return Number(q.insertLodge.run(l.lodge, l.number, l.province).lastInsertRowid); },
    updateLodge(id, l) { return q.updateLodge.run(l.lodge, l.number, l.province, id).changes > 0; },
    deleteLodge(id) { return q.removeLodge.run(id).changes > 0; },

    /** One-time personal message: returned once, then marked as shown (like column D of "cover"). */
    takePersonalMessage(mobile) {
      const row = q.message.get(mobile);
      if (!row || row.shown_at || !String(row.message).trim()) return '';
      const changed = q.markShown.run(mobile).changes;
      return changed ? String(row.message).trim() : '';
    },
    listMessages() { return q.messages.all(); },
    upsertMessage(mobile, message) { q.upsertMessage.run(normalizeMobile(mobile), message); },
    resetMessage(mobile) { return q.resetMessage.run(mobile).changes > 0; },
    deleteMessage(mobile) { return q.removeMessage.run(mobile).changes > 0; }
  };
}

module.exports = { openDatabase };
