# Greek Dinner Registration — standalone web app

A copy of the Greek dinner-registration form (`forms/greek-grand-communication`, build `NGLG-7S-R6`) that runs as an ordinary website instead of a Google Apps Script web app.

**Why:** the Apps Script version fails on phones that are signed in to more than one Google account. This version makes plain HTTPS requests to its own server, so it needs no Google sign-in and works in any browser.

## What it includes

| | Apps Script version | This app |
|---|---|---|
| Form page | `Index.html` | `public/index.html`: the same page, graphics and behaviour |
| Registrations | Google Sheet `DEC 2026`, `MAY 2027` | Its own SQLite database (`registrations` table) |
| Lodge list | Sheet `lodges` | `lodges` table, pre-filled with the 86 Lodges and numbers, editable in the admin panel |
| One-time personal messages | Sheet `cover` | `personal_messages` table, managed in the admin panel |
| Statistics | Sheet `Στατιστικά` | **Στατιστικά** tab in the admin panel (same figures) |
| Confirmation email | `MailApp` | SMTP. The email has the same subject, layout and text as before |
| Organiser notification | `ORGANIZER_EMAIL` | `ORGANIZER_EMAIL` |

Behaviour kept from the original:

- Lodges filtered by Province/Region.
- Grand Officer office lists.
- Duplicate-mobile block for each event, enforced by the database.
- The confirm-your-email step.
- Each registration is saved **before** the email is sent, so an email failure never loses a registration.
- Every registration receives the same confirmation email.

## Admin panel: `/admin`

The admin panel is protected by the `ADMIN_PASSWORD`. Visitors to the public form cannot read any data. In the panel the admin can:

- **Εγγραφές:** view registrations by event, search them, add, edit (with admin notes) or delete a registration, re-send the confirmation email, and download a CSV file that opens in Excel with Greek characters intact.
- **Στατιστικά:** see totals, Brothers, guests, participation per Province, and the leading Lodge for each event.
- **Στοές:** add, rename, renumber or remove Lodges shown in the form.
- **Προσωπικά μηνύματα:** set one-time messages by mobile number, and reset one so it shows again.

## Run locally

```bash
npm ci
cp .env.example .env   # then edit .env
npm start              # http://localhost:3000  and  http://localhost:3000/admin
npm test
```

Requires Node.js 22.13 or newer. The database uses Node's built-in SQLite module, so nothing needs compiling.

## Deploy

The app is a single Node.js process that stores one database file. Any host that offers **persistent storage** will work. Without persistent storage the database is erased on every restart.

### Render (chosen host)

The repository root contains [`render.yaml`](../../render.yaml), a Render Blueprint that sets up everything: the Frankfurt region, a Node.js web service, a 1 GB persistent disk for the database, a health check, and an automatically generated `SESSION_SECRET`.

1. The code must be on GitHub, on the branch Render deploys (normally `main`).
2. In Render, choose **New → Blueprint**, connect GitHub, and select `NGLG-GSEC/nglg-registration-forms`.
3. Render asks for the secret values. Fill them in:
   - `ADMIN_PASSWORD`: the password for `/admin`
   - `SMTP_USER` and `MAIL_FROM`: the `@nglgreece.gr` address that sends the emails
   - `SMTP_PASS`: that account's Google App password (see Email set-up below)
   - `ORGANIZER_EMAIL` and `MAIL_BCC`: optional, can be left empty
4. Click **Apply**. After the deploy, the form is at `https://nglg-greek-dinner.onrender.com` and the admin panel at `/admin`. Render shows the exact address.
5. Optional: to use your own address, open the service → **Settings → Custom Domains**, add for example `register.nglgreece.org`, and create the CNAME record Render shows at your DNS provider. Render issues HTTPS automatically.

**Cost:** the persistent disk requires a paid instance. The Starter plan is about $7 a month, plus about $0.25 a month for the 1 GB disk. Render's free plan has no disk, and its data would be erased on every restart, so don't use it for this app.

**Backups:** Render takes daily snapshots of the disk. You can also download a CSV at any time from the admin panel.

Every push to the deployed branch redeploys automatically. The database on the disk is kept.

### Alternative: Docker on a VPS (Hetzner, DigitalOcean, etc.)

```bash
docker build -t nglg-dinner .
docker run -d --name nglg-dinner --restart unless-stopped -p 3000:3000 \
  -v nglg-dinner-data:/data --env-file .env nglg-dinner
```

Put the app behind HTTPS (for example Caddy or nginx), and point a subdomain such as `register.nglgreece.org` at it.

### Email set-up (Google Workspace)

To send from the same `@nglgreece.gr` address as before:

1. Sign in to that Google account and turn on 2-Step Verification.
2. Create an **App password** under Google Account → Security → App passwords.
3. Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER` and `MAIL_FROM` to the address, and `SMTP_PASS` to the app password.

If email is not configured, registrations are still saved. The admin panel shows a warning, and the confirmation can be sent later with **Αποστολή email**.

## Backups

All data is in the single file `DATABASE_FILE`. Copy it regularly, or download the CSV export from the admin panel.

## Privacy

Never commit `.env`, the `data/` folder, or exported CSV files. All three are listed in `.gitignore`.
