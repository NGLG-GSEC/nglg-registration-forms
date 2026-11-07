# Application Index

This repository contains two independent Google Apps Script web applications for the National Grand Lodge of Greece. Each application has its own source folder, backend, interface, Google Sheet destination and deployment.

- **GitHub repository:** [dskiad/nglg-registration-forms](https://github.com/dskiad/nglg-registration-forms)
- **Application index:** [APP_INDEX.md](https://github.com/dskiad/nglg-registration-forms/blob/main/APP_INDEX.md)

## Applications at a glance

| Application | Language and audience | Purpose | GitHub application page | Deployment URL | Data destination | Build |
|---|---|---|---|---|---|---|
| Foreign Delegations — Corfu 2026 | English — invited foreign delegations | Registration and travel information for the Semi-Annual Grand Communication in Corfu, 18–19 December 2026 | [GitHub source and files](https://github.com/dskiad/nglg-registration-forms/tree/main/forms/foreign-delegations-corfu-2026) | [Open deployed Web App](https://script.google.com/a/macros/nglgreece.gr/s/AKfycbxlT3ubfUS6TYloOAfd1BNSq4WvnA9_ekRJIyOUSGSC34Ie2oEyXJhVAM2fLqT9TNS0OA/exec) | `Form 18 19 Dec 2026` → `form1` | `NGLG-EN-CORFU-2026-R7` |
| Greek Dinner Registration | Greek — members of the National Grand Lodge of Greece | Dinner attendance for the Grand Communications of 19 December 2026 and 15 May 2027 | [GitHub source and files](https://github.com/dskiad/nglg-registration-forms/tree/main/forms/greek-grand-communication) | [Open deployed Web App](https://script.google.com/macros/s/AKfycbztmwT5CG1FtDICWeZDKsuM3vXT99kvVGfWcPIjNvhfcj9PP0qFxB27CfMxWIGg7UCfsg/exec) | Configured private Google Sheet → `DEC 2026`, `MAY 2027` and `Στατιστικά` | `NGLG-7S-R6` |

## 1. Foreign Delegations — Corfu 2026

### What it does

- Collects details for the Head of Delegation and up to two additional participants.
- Records Grand Lodge, rank, accompanying persons, travel dates, flights and dietary requirements.
- Shows multilingual welcome messages based on the selected Grand Lodge.
- Displays flight details only when flights have been booked.
- Saves every registration to `Form 18 19 Dec 2026`, worksheet `form1`.
- Sends a designed confirmation email to the registrant.
- Sends a separate notification to the Grand Chancellor.
- Includes the NGLG emblem, Grand Chancellor signature photograph and practical travel information.
- Supports manually entered spreadsheet rows through the `SEND EMAIL` control in column AA.
- Stores data before attempting email delivery, preventing loss of registrations when email delivery fails.

### Main files

- [Index.html](forms/foreign-delegations-corfu-2026/Index.html) — public webform interface.
- [Code.gs](forms/foreign-delegations-corfu-2026/Code.gs) — submission, spreadsheet and email backend.
- [README.md](forms/foreign-delegations-corfu-2026/README.md) — setup and deployment instructions.
- [links.json](forms/foreign-delegations-corfu-2026/links.json) — deployment and destination registry.
- [assets](forms/foreign-delegations-corfu-2026/assets/) — inline email images.

## 2. Greek Dinner Registration

### What it does

- Registers Greek NGLG members for the dinner, not for attendance at the Grand Communication itself.
- Supports the Corfu event of 19 December 2026 and the Athens event of 15 May 2027.
- Filters Lodges according to Province or Region.
- Uses the approved list of Grand Officers.
- Prevents duplicate registrations with the same mobile number.
- Displays one-time personal messages from the private `cover` worksheet.
- Allows the registrant to confirm or correct the email address before submission.
- Sends a confirmation email and reports the actual delivery status.
- Updates totals, guests, Province/Region participation and the leading Lodge in `Στατιστικά`.

### Main files

- [Index.html](forms/greek-grand-communication/Index.html) — responsive Greek webform.
- [Code.gs](forms/greek-grand-communication/Code.gs) — event, validation, email and statistics backend.
- [appsscript.json](forms/greek-grand-communication/appsscript.json) — Apps Script project manifest.
- [README.md](forms/greek-grand-communication/README.md) — spreadsheet structure and deployment instructions.
- [assets](forms/greek-grand-communication/assets/) — background, emblem and Grand Master portrait.

## 3. Greek Dinner Registration — standalone web app

### What it does

- Shows the same Greek form, with the same graphics and behaviour, as an ordinary website. No Google account is needed, which fixes the problem on phones signed in to several Google accounts.
- Stores registrations, Lodges and one-time personal messages in its own SQLite database.
- Sends every registrant the same confirmation email as the Apps Script version, through SMTP.
- Provides a password-protected admin panel at `/admin` to view, search, add, edit, delete and export registrations, re-send emails, see statistics, and manage Lodges and personal messages.

### Main files

- [README.md](apps/greek-dinner-web/README.md) — set-up, email and deployment instructions.
- [public/index.html](apps/greek-dinner-web/public/index.html) — public form.
- [public/admin.html](apps/greek-dinner-web/public/admin.html) — admin panel.
- [src/](apps/greek-dinner-web/src/) — server, database and email code.

## Separation of the two applications

The applications share this GitHub repository only for version control. They must remain separate in operation:

1. Each form uses its own folder.
2. Each form should use its own Google Apps Script project.
3. Each form has its own Web App deployment.
4. Each form writes to its own Google Sheet structure.
5. Files from one folder must not be copied into the other Apps Script project.

## Privacy

No participant registrations, mobile-message lists, email addresses, phone numbers, travel details or credentials should be committed to GitHub. All operational data remains in access-controlled Google Sheets.
