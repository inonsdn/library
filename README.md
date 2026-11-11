# Folio — a personal Drive library

React + Vite, deployed exclusively on Vercel. Reads the configured Google Drive folder live after Google authorization. Supports series → episode → images folders, naturally ordered edge-to-edge image pages, PDFs, plain text/Markdown/CSV, audio/video, chapter navigation, search, saved books, and local chapter history. Other file types use Google Drive previews with an Open in Drive fallback. The compact Lavender Mist interface shows your last read and collection. No book files or catalog are published to GitHub. Drive HTML is never executed.

## Local development

Requires Node 22 or newer.

```sh
npm ci
cp .env.example .env.local
vercel dev
```

Set `VITE_GOOGLE_CLIENT_ID` to a Google OAuth **Web application** client ID. Alternatively enter the ID through Connection settings in the app. Client IDs are public identifiers; never enter a client secret. `VITE_DRIVE_FOLDER_ID` defaults to the supplied library folder.

## Google configuration

1. In Google Cloud Console, enable Google Drive API in the client’s project.
2. Configure the OAuth consent screen with `https://www.googleapis.com/auth/drive.readonly`. If in testing, add your account as a test user. External production apps requesting this restricted scope may require Google verification.
3. Add `http://localhost:5173` and the exact production Vercel origin as Authorized JavaScript origins on the Web client. Add preview origins separately if needed. No redirect URI is required for the popup token flow.
4. Sign in with the account that has access to the configured folder.

The connection is stored in a Secure, HttpOnly, SameSite cookie until Google’s access token expires (at most one hour). Reloading restores the valid connection automatically. Expired authorization requires reconnecting; indefinite background refresh requires a server OAuth code flow with a client secret. Image/PDF bytes stream through Vercel without waiting for a full download or decode. Tokens are sent to Google Drive API and the same-origin session endpoint. Saved books and chapter history are stored locally by file ID, shared by browser users; use a separate browser profile for separate accounts. Disconnect clears the live catalog and saved session cookie. It does not revoke Google’s stored consent; revoke that in your Google account if desired. Your existing Drive sharing is preserved.

## Vercel deployment

Import `inonsdn/library` into Vercel, select Vite, and set `VITE_GOOGLE_CLIENT_ID` in project environment variables. Build command: `npm run build`; output: `dist`. Deploy, then add the resulting exact origin in Google Cloud as above. The session and streaming endpoints run as Vercel Functions; no other hosting service is required.

Or from an authenticated Vercel CLI:

```sh
vercel --prod
```

## Validation

```sh
npm test
npm run build
```

The tests cover pagination, page ordering, HTML exclusion, and expired authorization. A real private-Drive end-to-end check requires browser Google consent; a chat connector’s access does not transfer to the deployed website. Pages reserve their image dimensions and preload three viewport heights ahead, replenishing continuously while scrolling. A four-download queue prioritizes the current viewport and streams images directly into the visible image elements. Reading history resumes at the last chapter, not an exact scroll offset. EPUB/CBZ parsing is not included; these files use the Drive preview/download fallback. Use `vercel dev` for local testing of the session and media endpoints (`npm run dev` serves only the frontend).
