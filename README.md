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

## Apps Script API

Use `google-apps-script/Code.gs` as the API backend. The Apps Script project does not need an HTML file.

1. Create a Google Sheet named `Ledger`.
2. In the Sheet, open **Extensions > Apps Script**.
3. Replace `Code.gs` with `google-apps-script/Code.gs`.
4. Paste `google-apps-script/appsscript.json` into **Project Settings > Show appsscript.json manifest file**.
5. Deploy with **Deploy > New deployment > Web app**.
6. Set **Execute as** to yourself.
7. Set access to **Anyone**, then deploy.
8. Use the GitHub Pages URL as the app link.

The app stores entries in a `Ledger` tab in the Sheet. It creates the tab and headers automatically.

## Local Single-Computer Version

For the shared version, use the GitHub Pages URL. Opening `index.html` directly from disk is only useful for layout checks because browser security rules can block the shared backend.

- Deposits increase a person's balance.
- Withdrawals decrease a person's balance.
- Service fees decrease a person's balance.
- Blank people are saved as `Unassigned`.

Use **Export CSV** regularly to keep a backup.

## Shared Google Sheets Note

The GitHub Pages app is configured to use this Apps Script API:

```text
https://script.google.com/macros/s/AKfycbzonW0VKREVtOx8jb7h7mv9iAnmJGJ7OaOWRle4tyZf8AhRt1hyEHPslu_iCCmv55LZNA/exec
```

When updating Apps Script, save `Code.gs` and deploy a new version from **Deploy > Manage deployments**. Set access to **Anyone** so the GitHub Pages app can load the Sheet without redirecting to Google sign-in.

The API supports JSONP calls:

- `?action=list&callback=callbackName`
- `?action=add&payload={"entry":{...}}&callback=callbackName`
- `?action=delete&payload={"id":"..."}&callback=callbackName`
- `?action=clear&callback=callbackName`
