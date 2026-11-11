# Folio — a personal Drive library

React + Vite, deployed exclusively on Vercel. Reads the configured Google Drive folder live after Google authorization. Supports series → episode → images folders, naturally ordered image pages, PDFs, chapter navigation, search, saved books, and local chapter history. No book files or catalog are published to GitHub. Drive HTML is never executed.

## Local development

Requires Node 22 or newer.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set `VITE_GOOGLE_CLIENT_ID` to a Google OAuth **Web application** client ID. Alternatively enter the ID through Connection settings in the app. Client IDs are public identifiers; never enter a client secret. `VITE_DRIVE_FOLDER_ID` defaults to the supplied library folder.

## Google configuration

1. In Google Cloud Console, enable Google Drive API in the client’s project.
2. Configure the OAuth consent screen with `https://www.googleapis.com/auth/drive.readonly`. If in testing, add your account as a test user. External production apps requesting this restricted scope may require Google verification.
3. Add `http://localhost:5173` and the exact production Vercel origin as Authorized JavaScript origins on the Web client. Add preview origins separately if needed. No redirect URI is required for the popup token flow.
4. Sign in with the account that has access to the configured folder.

Tokens exist only in browser memory and are sent only to Google Drive API. Reloading requires reconnecting. Expired authorization prompts a reconnect. Saved books and chapter history are stored locally by file ID, shared by browser users; use a separate browser profile for separate accounts. Disconnect clears the live catalog and token. It does not revoke Google’s stored consent; revoke that in your Google account if desired. Your existing Drive sharing is preserved.

## Vercel deployment

Import `inonsdn/library` into Vercel, select Vite, and set `VITE_GOOGLE_CLIENT_ID` in project environment variables. Build command: `npm run build`; output: `dist`. Deploy, then add the resulting exact origin in Google Cloud as above. No other hosting service or backend is required.

Or from an authenticated Vercel CLI:

```sh
vercel --prod
```

## Validation

```sh
npm test
npm run build
```

The tests cover pagination, page ordering, HTML exclusion, and expired authorization. A real private-Drive end-to-end check requires browser Google consent; a chat connector’s access does not transfer to the deployed website. Pages load as they approach the viewport. Reading history resumes at the last chapter, not an exact scroll offset. EPUB/CBZ parsing is not included.
