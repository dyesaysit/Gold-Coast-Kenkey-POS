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
On this computer:   http://localhost:4000
On phones (Wi-Fi):  http://192.168.x.x:4000
```

- Open the **localhost** address on the till PC.
- Open the **Wi-Fi** address on any phone connected to the same network.

The default port is **4000**. If it is already in use, the server automatically
tries 4001, 4002, and so on, and prints the address it actually used. To force a
specific port: `$env:PORT=5050; npm start` (PowerShell).

> **Important:** phones only share the till's data when they open the address
> printed by **`npm start`** (this Node server). Opening the app through a plain
> static file server (or as a local file) runs it in standalone localStorage
> mode, where each device keeps its own separate data.

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

## How the client uses it

`js/services/server-sync.js` decides the mode once at startup by calling
`/api/health`:

- **No server** (app opened as a file, or served by a plain static server):
  the app stays in Phase 1 localStorage mode, completely unchanged.
- **Served by this server:** the app hydrates its local cache from
  `/api/bootstrap`, mirrors catalogue/settings edits to the server, routes
  checkout through `/api/sales`, and uses `/api/backup` and `/api/restore` for
  the admin backup screen. `localStorage` stays as the local read cache, so the
  rest of the app is unchanged.

A device pulls the latest shared data on load and whenever its window regains
focus. (Live push to already-open screens on other devices is a later
refinement — see the slide-up/real-time notes in `docs/ROADMAP.md`.)

## Status

Phase 2 is functional: the server, the database, and the client wiring are all
in place and tested. The standalone Phase 1 app still works with no server.
