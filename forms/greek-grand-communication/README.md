# Greek dinner registration form

## Live form

**Link to share (works on every phone):** https://nglg-gsec.github.io/nglg-registration-forms/greek-dinner/

Phones whose browser is signed in to more than one Google account cannot open
an Apps Script `/exec` page ("Sorry, unable to open the file at this time").
This is a Google limitation that no script change can fix. The form is
therefore also published on GitHub Pages (`docs/greek-dinner/index.html`, an
exact copy of `Index.html`). That page talks to the Apps Script only in the
background, through the JSON interface (`?action=ping|data|mobile` and
`POST {action:'submit'}`), without sending any Google login cookies, so the
number of Google accounts on the phone no longer matters.

Direct Apps Script link (PC only):

[Open the deployed Greek registration form](https://script.google.com/macros/s/AKfycbztmwT5CG1FtDICWeZDKsuM3vXT99kvVGfWcPIjNvhfcj9PP0qFxB27CfMxWIGg7UCfsg/exec)

This is the Greek NGLG dinner-registration web app (`BUILD NGLG-7S-R8`). It is separate from the English foreign-delegation form.

## Supported events

- Μεγάλη Συνέλευση 19ης Δεκεμβρίου 2026 → worksheet `DEC 2026`
- Μεγάλη Συνέλευση 15ης Μαΐου 2027 → worksheet `MAY 2027`

If `MAY 2027` does not exist, the backend creates it with the same response headers.

## Spreadsheet structure

The source spreadsheet should contain:

- `DEC 2026` with the headers: `register day`, `name`, `surname`, `Salutation`, `Office`, `Province`, `Lodge`, `Partner`, `mobile`, `email`
- `lodges` with `lodge`, `number`, `province`
- `web text` (optional presentation text)
- `cover` or `cover ` (optional) with mobile in column A, personal message in column B, and the one-time display timestamp in column D

The app creates/updates `Στατιστικά`. December statistics use columns A:B and May statistics use D:E.

## Deploy in Google Apps Script

1. Import the master workbook into Google Sheets, or open the existing Google Sheet that contains the same tabs.
2. Open **Extensions → Apps Script**.
3. Replace `Code.gs`, add an HTML file named `Index`, and paste in the matching files from this folder.
4. In **Project Settings → Script properties**, set `SPREADSHEET_ID` to the Google Sheet ID. A spreadsheet-bound script can omit this property.
5. Optionally set `ORGANIZER_EMAIL` to receive a copy/notification for every registration.
6. Deploy as **Web app**, execute as **Me**, and grant access to **Anyone** (not "Anyone with Google account" — otherwise the GitHub Pages form cannot reach it).
7. After every code change, use **Deploy → Manage deployments → Edit → Version: New version**, so the `/exec` URL stays the same. If the URL changes, update `API_URL` in `Index.html`.
8. Copy `Index.html` to `docs/greek-dinner/index.html` whenever it changes (the two files must stay identical).
9. Test the backend: open `<exec URL>?action=ping` — it must show `{"ok":true,...}`.

## GitHub Pages (one-time setup)

Repository **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder `/docs` → Save**. After about a minute the form is live at https://nglg-gsec.github.io/nglg-registration-forms/greek-dinner/

## Behaviour

- Filters lodges by Province/Region and displays lodge numbers.
- Uses the approved 36-item list of active Grand Officers in the exact supplied order.
- Prevents duplicate registrations with the same mobile number in the selected event sheet.
- Displays a personal mobile message only once and records the display time in column D of `cover`.
- Confirms/corrects the email before submission.
- Saves the registration even if the confirmation email service fails, and returns the real email-delivery status to the browser.
- Updates event statistics after every registration.

The public repository contains no real mobile-to-message mappings. Personal messages remain in the private Google Sheet.
