# Phase 2 Server (optional)

The Gold Coast Kenkey POS runs entirely in the browser from `index.html` with no
server — that is the graded Phase 1 app and it still works on its own.

This `server/` folder is the **optional Phase 2 upgrade**: a tiny Node server
with a shared **SQLite** database, so the till PC and phones on the same Wi-Fi
can all take sales into one shared dataset. See `docs/ROADMAP.md` for the plan.

It uses **zero external packages** — only Node's built-in `http` and
`node:sqlite` (Node 22.5+). There is nothing to `npm install`.

## Run it

From the project root:

```bash
npm start
```

(That is just `node --experimental-sqlite server/server.js`.)

On start it prints two addresses:

```
On this computer:   http://localhost:3000
On phones (Wi-Fi):  http://192.168.x.x:3000
```

- Open the **localhost** address on the till PC.
- Open the **Wi-Fi** address on any phone connected to the same network.

The database file is created at `server/data/gckpos.db` (git-ignored). On the
very first run the database is seeded with the same sample data as the
client app.

## What the server does

- **Serves the app** to every device on the network (the same HTML/CSS/JS).
- **Shared data** via a small REST API (`/api/...`): catalogue, users, settings,
  and sales all live in the one SQLite database.
- **Safe checkout across devices:** the server assigns each receipt number and
  decrements stock inside a single transaction, so two tills can never collide.
- **Backup & restore:** `GET /api/backup` downloads a `gckpos-backup` file in the
  exact same format the browser app uses, and `POST /api/restore` loads one back
  in. Existing backups exported from the Phase 1 app import unchanged.
- **Security headers** (`X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`) are set on every response — the ones that `docs/SECURITY.md`
  noted can only come from a server.

## REST API summary

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness + business name (used to detect server mode) |
| GET | `/api/bootstrap` | All collections, keyed by storage key, to hydrate a client |
| GET | `/api/sales` | Sales history |
| POST | `/api/sales` | Complete a sale (server assigns receipt number, decrements stock) |
| GET/PUT | `/api/settings` | Read / replace settings |
| PUT | `/api/collections/:name` | Replace a catalogue collection (e.g. `categories`) |
| GET | `/api/backup` | Download a `gckpos-backup` file |
| POST | `/api/restore` | Replace all data from a `gckpos-backup` file |

## Status

This is the **server + database foundation**. The browser client still runs in
its normal localStorage mode and is unchanged. Wiring the client to talk to this
API (so phones actually share the till's data) is the next Phase 2 step, and will
be added behind server-mode detection so the standalone app keeps working.
