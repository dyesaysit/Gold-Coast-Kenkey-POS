# Gold Coast Kenkey POS Security Notes

This is a **client-side** app: all data lives in the browser's `localStorage`
on the device, and there is no backend server. The notes below describe the
protections built into the app, the risks that remain because of that design,
and the hardening you must add **at deploy time** on whatever web server hosts
the files.

## 1. Built-in protections

- **No script injection surface.** All rendering uses `textContent` /
  `createElement` (never `innerHTML` with user data), so product names,
  category names, business details, receipt notes, etc. cannot execute code.
- **Content-Security-Policy** (`<meta>` in `index.html`): only the app's own
  scripts/styles run (`script-src 'self'`), plugins are blocked
  (`object-src 'none'`), `<base>`/form hijacking is blocked
  (`base-uri 'none'`, `form-action 'none'`), and images allow `self` + `data:`
  (for logos/photos). A `no-referrer` policy is also set.
- **Image uploads** are limited to JPG/PNG/WebP/GIF (no SVG) and are
  **re-encoded to JPEG through a canvas**, which strips any embedded scripting.
- **PDF export** escapes `\ ( )` and non-ASCII characters, so text cannot break
  out of PDF strings.
- **Backup import** is Admin-only, schema-validated, size-capped (15 MB), and
  only writes a fixed whitelist of storage keys. A failed restore rolls back.
- **Role checks are enforced twice** — navigation visibility *and* the action
  handlers (`isAdmin()`, `canManage()`), so hiding a button is not the only gate.
- **Login hardening:** PIN fields are masked; the login pad locks for 30 s after
  5 wrong PINs; the till auto-signs-out after 15 minutes of inactivity (the cart
  persists, so no sale is lost).

## 2. Residual risks (inherent to a browser-only app)

- **PINs are stored in plaintext** in `localStorage`. Anyone with access to the
  device and its DevTools can read them. This is acceptable for a school project
  (see `DATABASE-DESIGN.md` §12), **but a production deployment needs a backend**
  that hashes and verifies PINs server-side.
- **The PIN lockout is client-side** (in memory) — clearing storage or reloading
  resets it. It deters casual guessing at the till, not a determined attacker
  with the device.
- **Data is per-device and unencrypted.** Use the built-in **Export backup**
  regularly, and rely on the operating system's disk encryption and device lock
  to protect the machine.

## 3. Deploy-time hardening (required)

The CSP lives in the page, but a few protections can **only** be set as HTTP
response headers by the web server. When you host the app:

1. **Serve over HTTPS.** Never serve the POS over plain HTTP in production.
2. Add these response headers:
   - `X-Frame-Options: DENY` (or `Content-Security-Policy: frame-ancestors 'none'`)
     — prevents the POS being embedded/clickjacked in another site's frame.
     (This one cannot be set from the page's `<meta>` tag.)
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: no-referrer`
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (HTTPS only)
   - Optionally move the CSP from the `<meta>` tag into a
     `Content-Security-Policy` header as well (headers take precedence and cover
     the whole response).

### Sample: nginx

```nginx
server {
  # ... listen 443 ssl; server_name ...; root /path/to/gold-coast-kenkey-pos;
  add_header X-Frame-Options "DENY" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "no-referrer" always;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header Content-Security-Policy
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" always;
}
```

### Sample: Apache (`.htaccess` or vhost)

```apache
Header always set X-Frame-Options "DENY"
Header always set X-Content-Type-Options "nosniff"
Header always set Referrer-Policy "no-referrer"
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
```

## 4. Phase 2 server (`server/`)

The optional Phase 2 server adds a network surface, so it has its own posture.

**Protections in place**
- **Local only by default.** The server binds to `localhost`; exposing it to the
  Wi-Fi is an explicit opt-in (`GCKPOS_HOST=0.0.0.0`), and that mode prints a
  warning. A single-machine install is therefore not network-exposed at all.
- **SQL injection safe.** All values use parameterized (`?`) queries; only fixed,
  whitelisted table names are ever interpolated.
- **Static serving** is limited to the browser files (server source, dotfiles,
  and the database are never served) and guards against path traversal.
- Request bodies are **size-capped** (20 MB); the security headers from §1 are
  set on every response.

**Known gaps to close before a real multi-device deployment**
- **The REST API has no authentication.** Anyone who can reach the server
  (i.e. any device on the Wi-Fi in LAN mode) can read all data and create,
  modify, or wipe it — the client's role checks are not enforced server-side.
  This is why LAN mode is opt-in and must run only on a trusted private network.
  Fix: a server-side login (PIN → token) that gates the mutating/data endpoints.
- **PINs are stored and served in plaintext** (`/api/bootstrap`, `/api/backup`).
  Fix: hash PINs and verify them server-side.
- **Sale totals are trusted from the client** (not recomputed server-side).

These are tracked in `docs/ROADMAP.md` and are the main security work for a
production, multi-device version.

## 5. Reporting

For a school project, raise any suspected security issue with the team rather
than opening it publicly.
