'use strict';

const path = require('node:path');
const { openDatabase } = require('./src/db');
const { createMailer } = require('./src/mail');
const { createApp } = require('./src/app');

try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* .env is optional */ }

const env = process.env;
const repo = openDatabase(env.DATABASE_FILE || path.join(__dirname, 'data', 'registrations.db'));
const mailer = createMailer(env);
if (!mailer.configured) console.warn('SMTP is not configured: registrations are saved but no emails are sent.');

const port = Number(env.PORT || 3000);
createApp({ repo, mailer, env }).listen(port, () => {
  console.log('NGLG dinner registration listening on http://localhost:' + port);
});
