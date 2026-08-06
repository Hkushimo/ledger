# Simple Ledger

A small installable ledger for tracking pooled bank account activity by person.

## GitHub Pages PWA

This repo is ready to deploy as a static GitHub Pages app.

1. Create a new GitHub repository.
2. Push this folder to the repository's `main` branch.
3. In GitHub, open **Settings > Pages**.
4. Set **Source** to **GitHub Actions**.
5. Push to `main`, or run the **Deploy GitHub Pages** workflow manually.

After the Pages URL is live, open it in Chrome, Edge, or Safari and use the browser install option. The app uses the Google Apps Script web app as its backend, so everyone who opens the Pages link reads and writes the same Google Sheet.

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

For the shared version, use the GitHub Pages URL. Opening `index.html` directly from disk is only useful for layout checks because browser security rules can block the shared backend.

- Deposits increase a person's balance.
- Withdrawals decrease a person's balance.
- Service fees decrease a person's balance.
- Blank people are saved as `Unassigned`.

Use **Export CSV** regularly to keep a backup.

## Shared Google Sheets Note

The files in `google-apps-script/` must be deployed as the Apps Script web app backend. The GitHub Pages app is configured to use:

```text
https://script.google.com/a/macros/keemthedesigner.xyz/s/AKfycbzonW0VKREVtOx8jb7h7mv9iAnmJGJ7OaOWRle4tyZf8AhRt1hyEHPslu_iCCmv55LZNA/exec
```

When updating Apps Script, save both files and deploy a new version from **Deploy > Manage deployments**.
