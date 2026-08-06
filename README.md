# Simple Ledger

A small installable ledger for tracking pooled bank account activity by person.

## GitHub Pages PWA

This repo is ready to deploy as a static GitHub Pages app.

1. Create a new GitHub repository.
2. Push this folder to the repository's `main` branch.
3. In GitHub, open **Settings > Pages**.
4. Set **Source** to **GitHub Actions**.
5. Push to `main`, or run the **Deploy GitHub Pages** workflow manually.

After the Pages URL is live, open it in Chrome, Edge, or Safari and use the browser install option. The PWA caches the app shell for offline use. Ledger data is stored in that browser's local storage, so use **Export CSV** for backups.

## Shared Google Sheets Version

Use the files in `google-apps-script/` when two people need to manage the same ledger from separate computers.

1. Create a Google Sheet named `Ledger`.
2. In the Sheet, open **Extensions > Apps Script**.
3. Add two Apps Script files:
   - `Code.gs` from `google-apps-script/Code.gs`
   - `Index.html` from `google-apps-script/Index.html`
4. Paste `google-apps-script/appsscript.json` into **Project Settings > Show appsscript.json manifest file**.
5. Deploy with **Deploy > New deployment > Web app**.
6. Set **Execute as** to yourself.
7. Set access to the narrowest option that includes both users, then deploy.
8. Open the web app URL from each computer.

The app stores entries in a `Ledger` tab in the Sheet. It creates the tab and headers automatically.

## Local Single-Computer Version

Open `index.html` in a browser. Entries are saved only in that browser's local storage.

- Deposits increase a person's balance.
- Withdrawals decrease a person's balance.
- Service fees decrease a person's balance.
- Blank people are saved as `Unassigned`.

Use **Export CSV** regularly to keep a backup or move data between the local and shared versions.

## Shared Google Sheets Note

The files in `google-apps-script/` are still included for the shared Google Sheets-backed version. GitHub Pages cannot directly use `google.script.run`, so the Pages PWA is the standalone local-storage version unless a separate API bridge is added.
