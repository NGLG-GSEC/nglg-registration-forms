# NGLG Registration Forms

Official registry and implementation notes for online registration forms of the National Grand Lodge of Greece.\n\n## Application index\n\n[Open the complete index of applications and their functions](APP_INDEX.md)

## Foreign Delegations — Corfu 2026

- **Language / audience:** English — invited foreign delegations
- **Event:** Semi-Annual Grand Communication
- **Dates:** 18–19 December 2026
- **Location:** Corfu, Greece
- **Status:** Active
- **Public registration form:** [Open the English registration form](https://script.google.com/a/macros/nglgreece.gr/s/AKfycbxlT3ubfUS6TYloOAfd1BNSq4WvnA9_ekRJIyOUSGSC34Ie2oEyXJhVAM2fLqT9TNS0OA/exec)
- **Official website:** [nglgreece.org/en](https://nglgreece.org/en/)
- **Response destination:** `Form 18 19 Dec 2026` → `form1`
- **Build:** `NGLG-EN-CORFU-2026-R7`
- **Last code update:** 25 August 2026

The form can also be reached through the official website under **External Relations → REGISTER IN Semi Annual Grand Communication – 18 & 19 Dec 2026 in Corfu**.

## Greek dinner registrations

- **Language / audience:** Greek — members of the National Grand Lodge of Greece
- **Purpose:** Dinner attendance registration (not registration for the Grand Communication itself)
- **Supported events:** 19 December 2026 and 15 May 2027
- **Response destinations:** `DEC 2026` and `MAY 2027`
- **Build:** `NGLG-7S-R6`
- **Public registration form:** [Open the Greek registration form](https://script.google.com/macros/s/AKfycbztmwT5CG1FtDICWeZDKsuM3vXT99kvVGfWcPIjNvhfcj9PP0qFxB27CfMxWIGg7UCfsg/exec)
- **Status:** Active

The Greek form filters lodges by Province/Region, uses the approved 36-item Grand Officer list, blocks duplicate mobile registrations, supports one-time personal messages, confirms the email address before submission, sends a confirmation email, and updates event statistics.

### Standalone version (no Google sign-in)

`apps/greek-dinner-web/` is a copy of the same form that runs as an ordinary website with its own database, a password-protected admin panel (`/admin`) and the same confirmation email. It avoids the Apps Script problem on phones that are signed in to several Google accounts. See [its README](apps/greek-dinner-web/README.md) for deployment.

## Repository contents

- `forms/foreign-delegations-corfu-2026/` — production English registration form, backend, link registry, and deployment notes.
- `forms/greek-grand-communication/Code.gs` — Greek Apps Script backend.
- `forms/greek-grand-communication/Index.html` — responsive Greek dinner-registration form.
- `forms/greek-grand-communication/assets/` — form background, emblem, and Grand Master portrait.
- `forms/greek-grand-communication/README.md` — Greek-form spreadsheet structure and deployment instructions.
- `apps/greek-dinner-web/` — standalone Node.js version of the Greek form with its own database and admin panel.

## Privacy and security

This public repository contains **no submitted registrations or participant data**. Response spreadsheets and personal mobile messages remain access-controlled in Google Drive.

Never commit exported registrations, participant names, email addresses, phone numbers, travel details, credentials, or service-account files.
