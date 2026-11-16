# Folio — a personal Drive library

React + Vite, deployed exclusively on Vercel. Reads the configured Google Drive folder live after Google authorization. Supports `book → episode → content` with images, PDFs, and EPUBs, plus the original `episode → images` layout. JSON and unrelated files are excluded. The compact Lavender Mist interface shows your last read and collection. Manga images are edge to edge. Opening an episode queues every image immediately (four concurrent downloads), without waiting for scrolling. Approaching the final three screens appends and loads the entire next episode. Stalled downloads fall back to a direct Drive request with a timeout so the queue keeps moving. A remembered Continuous episodes toggle (on by default) controls automatic episode continuation. A fixed top-left Back button and browser Back return to the chapter list. Per-episode image anchors and relative offsets restore your scroll position, including after viewport resizing; PDF pages and EPUB positions are also remembered by their readers. PDF and EPUB readers offer vertical scrolling or horizontal pages, remembered reading positions, PDF zoom, and EPUB text sizing/contents. No book files or catalog are published to GitHub. Drive HTML and EPUB scripts are never executed.

## Local development

Requires Node 22 or newer.

```sh
npm ci
cp .env.example .env.local
vercel dev
```

Set `VITE_GOOGLE_CLIENT_ID` to a Google OAuth **Web application** client ID. Alternatively enter the ID through Connection settings in the app. Client IDs are public identifiers; never enter a client secret. `VITE_DRIVE_FOLDER_ID` defaults to the supplied library folder.

## Google configuration and automatic session renewal

1. Enable Google Drive API in the OAuth client's Google Cloud project.
2. Request `https://www.googleapis.com/auth/drive.readonly`. Add your account as a test user if the app is in Testing.
3. Add `https://library.nonsdn.com` as an Authorized JavaScript origin and **`https://library.nonsdn.com/api/auth/callback` as an Authorized redirect URI** for the existing Web application client.
4. In Vercel Production environment variables, set `GOOGLE_CLIENT_SECRET` to that client's secret and `SESSION_ENCRYPTION_KEY` to a stable random value of at least 32 characters. Never prefix these with `VITE_`, commit them, or put them in the frontend. `GOOGLE_CLIENT_ID` optionally overrides the existing client ID; `APP_ORIGIN` defaults to `https://library.nonsdn.com`.
5. Redeploy after setting environment variables, then connect once to upgrade the previous access-token-only connection.

The server uses the authorization-code flow with offline access, a browser-bound OAuth state cookie, and PKCE. Access and refresh tokens are encrypted in a Secure, HttpOnly, SameSite=Lax cookie. Drive metadata, file contents, and token renewal go through Vercel Functions; Google credentials are not returned to browser JavaScript. Access tokens renew automatically when needed. User activity renews a **three-day inactivity deadline**. Background requests and an unattended tab do not keep extending it. Existing one-hour connections remain usable during migration; when configuration is ready the app offers a one-time upgrade.

Google may revoke or expire refresh tokens independently. **External apps in Google's Testing publishing status receive Drive refresh tokens that expire after seven days, even with active use.** To avoid that testing limit, change the app's publishing status in Google Cloud and satisfy Google's applicable verification requirements. The library cannot override Google's expiry or revoked consent.

The encryption key must remain stable across deployments. Changing it signs out existing sessions. Disconnect clears the saved session; Google consent can separately be removed in your Google account. Existing Drive file sharing is preserved. Reading positions and bookmarks are stored locally by file ID.

## Vercel deployment

Import `inonsdn/library` into Vercel, select Vite, and configure the server environment variables above. Build command: `npm run build`; output: `dist`. Deploy, then add the resulting exact origin in Google Cloud as above. The session and streaming endpoints run as Vercel Functions; no other hosting service is required.

Or from an authenticated Vercel CLI:

```sh
vercel --prod
```

## Validation

```sh
npm test
npm run build
```

The tests cover pagination, page ordering, HTML exclusion, and expired authorization. A real private-Drive end-to-end check requires browser Google consent; a chat connector’s access does not transfer to the deployed website. Pages reserve their image dimensions and load the complete episode immediately. The next episode begins loading three viewport heights before the boundary. A four-download queue prioritizes the current viewport and streams images directly into the visible image elements. Reading history resumes at the saved chapter and image offset. PDF and EPUB have native readers with remembered vertical-scroll/horizontal-page modes. PDFs support lazy canvas rendering, page jumping, keyboard navigation, swipe at fit zoom, and zoom controls. EPUBs support reflow, text sizing, contents navigation, and saved CFI positions. Scripts in EPUB content are disabled. DRM-protected EPUBs are not supported. CBZ parsing is not included. Use `vercel dev` for local testing of the session and media endpoints (`npm run dev` serves only the frontend).
