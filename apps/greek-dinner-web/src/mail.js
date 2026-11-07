'use strict';

const nodemailer = require('nodemailer');
const { EVENTS, escapeHtml } = require('./constants');

const FROM_NAME_DEFAULT = 'Εθνική Μεγάλη Στοά της Ελλάδος';

/**
 * Builds the confirmation email. The text and layout are identical to
 * sendConfirmationEmail_() in the Apps Script version, so every registrant
 * receives the same reply as before.
 */
function buildConfirmationEmail(data) {
  const event = EVENTS[data.event];
  const fullName = data.salutation + ' ' + data.name + ' ' + data.surname;
  const subject = 'Επιβεβαίωση Εγγραφής ' + fullName + ' στο ' + event.dinner.replace(/^το /, '');
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
    '<tr><th style="padding:9px;border:1px solid #d0aa4f;background:#f5ecd5;text-align:left">' + escapeHtml(row[0]) + '</th>' +
    '<td style="padding:9px;border:1px solid #d0aa4f">' + escapeHtml(row[1]) + '</td></tr>'
  ).join('');

  const html = '<div style="max-width:680px;margin:auto;font-family:Arial,sans-serif;color:#061a35">' +
    '<div style="padding:24px;background:#123f78;color:white;text-align:center;border-bottom:4px solid #d0aa4f">' +
    '<h1 style="margin:0;font-size:23px">ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ ΤΗΣ ΕΛΛΑΔΟΣ</h1></div>' +
    '<div style="padding:28px;border:1px solid #d0aa4f">' +
    '<h2>Ευχαριστούμε για τη δήλωση συμμετοχής</h2>' +
    '<p>Αγαπητέ ' + escapeHtml(fullName) + ',</p>' +
    '<p>Η εγγραφή σας καταχωρίστηκε επιτυχώς.</p>' +
    '<div style="margin:18px 0;padding:14px;border:2px solid #a32626;background:#fff0e8;color:#861c1c;font-weight:bold">' +
    'ΠΡΟΣΟΧΗ: Η ΔΗΛΩΣΗ ΣΥΜΜΕΤΟΧΗΣ ΑΦΟΡΑ ΤΟ ΔΕΙΠΝΟ ΚΑΙ ΟΧΙ ΤΗ ΜΕΓΑΛΗ ΣΥΝΕΛΕΥΣΗ.</div>' +
    '<table style="width:100%;border-collapse:collapse">' + tableRows + '</table>' +
    '<p style="margin-top:25px">Για τη Διοργάνωση<br>Ο Μέγας Καγκελάριος<br><strong>Πσεβ. Αδ. Δημήτριος Σκιαδόπουλος</strong></p>' +
    '</div></div>';

  const text = 'Αγαπητέ ' + fullName + ',\n\n' +
    'Η εγγραφή σας καταχωρίστηκε επιτυχώς για ' + event.dinner + '.\n\n' +
    'ΠΡΟΣΟΧΗ: Η ΔΗΛΩΣΗ ΣΥΜΜΕΤΟΧΗΣ ΑΦΟΡΑ ΤΟ ΔΕΙΠΝΟ ΚΑΙ ΟΧΙ ΤΗ ΜΕΓΑΛΗ ΣΥΝΕΛΕΥΣΗ.\n\n' +
    'Για τη Διοργάνωση\nΟ Μέγας Καγκελάριος\nΠσεβ. Αδ. Δημήτριος Σκιαδόπουλος';

  return { to: data.email, subject, text, html };
}

function createMailer(env) {
  const configured = Boolean(env.SMTP_HOST && env.MAIL_FROM);
  const transport = configured ? nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 465),
    secure: String(env.SMTP_SECURE || (Number(env.SMTP_PORT || 465) === 465)) === 'true',
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
  }) : null;
  const from = { name: env.MAIL_FROM_NAME || FROM_NAME_DEFAULT, address: env.MAIL_FROM || '' };

  async function send(message) {
    if (!transport) throw new Error('Η αποστολή email δεν έχει ρυθμιστεί (SMTP_HOST / MAIL_FROM).');
    await transport.sendMail({ from, ...message });
  }

  return {
    configured,
    async sendConfirmation(data) {
      const message = buildConfirmationEmail(data);
      if (env.MAIL_BCC) message.bcc = env.MAIL_BCC;
      await send(message);
    },
    async notifyOrganizer(data, emailSent, emailError) {
      if (!env.ORGANIZER_EMAIL || !transport) return;
      const event = EVENTS[data.event];
      const status = emailSent ? 'Η επιβεβαίωση email στάλθηκε.' : 'Η επιβεβαίωση email απέτυχε: ' + emailError;
      try {
        await send({
          to: env.ORGANIZER_EMAIL,
          subject: 'Νέα εγγραφή δείπνου — ' + data.name + ' ' + data.surname,
          text: event.title + '\n' + data.name + ' ' + data.surname + '\n' + data.mobile + '\n' + data.email + '\n\n' + status
        });
      } catch (error) {
        console.error('Organizer notification failed:', error.message);
      }
    }
  };
}

module.exports = { createMailer, buildConfirmationEmail };
