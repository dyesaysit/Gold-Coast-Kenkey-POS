# Gold Coast Kenkey POS — Future Roadmap

This document captures the intended path from the current graded project to a
"standard-grade" multi-device Point-of-Sale system. It is planning only — none
of it is required for the project as submitted.

## Where the app is today

- **Client-side only.** All data lives in the browser's `localStorage` on one
  machine. There is no server and no shared database.
- The UI never touches `localStorage` directly — every read/write goes through
  a single storage layer (`js/services/storage-service.js`). This one seam is
  what makes the upgrades below achievable without rewriting the whole app.
- Runs in any modern browser; no install step needed for development.

## Phase 1 — Desktop packaging (the graded deliverable)

Goal: a `.exe` installer that puts the app on a till PC with a desktop shortcut
and runs it in a browser-based window.

- **Tool: Electron.** Chosen for familiarity, and because it bundles a known
  Chromium engine so the app renders identically on every machine.
  - Alternative considered: **Tauri** (~10 MB vs Electron's ~150 MB, uses the
    OS webview). Lighter, but Rust-based — not worth the learning cost for this
    milestone.
- **Scope:** single till machine, `localStorage` storage, offline-capable.
- This fully meets the project goal: web-based app, runs in a browser, desktop
  shortcut, self-contained installer. **No server or database work needed here.**

### Local security posture for Phase 1
Because it is a single-machine install, protection is physical/OS-level, not
web-server headers (see `SECURITY.md` §3, which only applies to public hosting):
- A locked Windows user account (PC login PIN/password).
- Disk encryption (BitLocker) so data is safe if the machine is stolen.
- A regular **Export backup** routine — all data lives on that one PC.
- The app's built-in protections (PIN lockout, idle auto-logout, CSP, input
  safety) work the same whether local or hosted.

## Phase 2 — Multi-device + real database (post-submission)

Goal: turn the single till into a "standard POS" where phones and other devices
on the same Wi-Fi can also take sales, all landing in one shared dataset.

**Key insight:** phone access and a real database are the *same* change, not two.
`localStorage` is private to one browser on one machine, so a phone would keep
its own separate data. A shared source of truth is required — that source is a
small server with a database.

### Architecture
- **Local server on the till PC:** Node + Express exposing a small REST API.
- **Database:** SQLite (e.g. `better-sqlite3`) — a single file, no separate DB
  server to run, ideal for one shop.
- **Clients:** the desktop *and* every phone open the app in a browser pointed
  at the till PC's address (e.g. `http://192.168.1.x:3000`). All sales, products,
  and users now live in the shared SQLite database.

### Migration path (why the current design pays off)
- Most of the work is **rewriting `storage-service.js`** to call the REST API
  instead of `localStorage`. The rest of the app already goes through this
  layer, so call sites change little by comparison.
- **The one real cost:** `localStorage` is *synchronous* (`getSales()` returns
  instantly), but network/database calls are *asynchronous* (they return a
  promise). So `storage-service` methods become async, and their callers in
  `app.js` must `await` them. This is the main effort of Phase 2 — and the
  reason to do it after grading, not before.
- Provide a one-time importer that reads an exported `localStorage` backup and
  seeds the SQLite database, so no data is lost in the transition.

### Security changes that become relevant in Phase 2
Once other devices connect over the network, the deploy-time items in
`SECURITY.md` §3 start to matter (HTTPS on the LAN, security headers set by the
Node server, and — critically — **hashing PINs server-side** instead of storing
them in plaintext). These are out of scope for Phase 1.

### Mobile UX: full slide-up cart drawer
Today the phone cart stacks below the product grid, and a sticky bottom bar
("Review order") scrolls it into view before payment — a solid, standard
pattern that removes the long scroll to checkout. The best-in-class refinement,
deferred to Phase 2 because it is a structural change (more state, more testing)
rather than a fix:

- Stop stacking the cart under the menu. Give the product grid the **entire**
  screen on phones.
- Turn the bottom bar into the handle for a **slide-up sheet (drawer)**: tapping
  it slides the cart up over the menu for review + edit + pay, then dismisses.
- This is the Square/Loyverse mobile model and keeps the menu maximally visible
  while the cart stays one tap away.

Purely a front-end change (CSS + `app.js`); it does not depend on the
Node/SQLite work above and could ship independently after grading.

## Summary

| Milestone | Storage | Devices | Needed for grade? |
|-----------|---------|---------|-------------------|
| Phase 1 — Electron install | `localStorage` | Single till PC | **Yes** |
| Phase 2 — Node + SQLite API | Shared SQLite DB | Till + phones on Wi-Fi | No (future work) |

## Implementation status

Phase 2 (Node + SQLite server, shared multi-device data, DB-backed
backup/restore) is **implemented** — see `server/` and
`js/services/server-sync.js`, run with `npm start`. It is layered behind
server-mode detection, so the Phase 1 standalone app is unchanged and still runs
with no server.

Still open as future refinements:
- **Live push** so already-open screens on other devices update without a reload
  or window refocus (today a device pulls fresh data on load and on focus).
- **Server-side PIN hashing** once authentication moves to the server
  (`docs/SECURITY.md`).
- The **full slide-up cart drawer** (mobile UX item above).
