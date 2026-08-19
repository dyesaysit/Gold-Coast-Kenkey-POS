# Building the Desktop Installer (Electron)

This packages the POS as a Windows desktop app: a double-clickable installer that
adds a **desktop shortcut**, and on launch opens the app in its own window with
the shared **SQLite** database running underneath. Cashiers' phones can connect
over Wi-Fi (opt-in). See `docs/ROADMAP.md` for how this fits Phase 1/2.

> **Build on Windows.** These steps download the Electron binary and build a
> Windows `.exe`, so run them on the till PC / a Windows dev machine — not in a
> headless sandbox. Node 22.5+ is required.

## 1. Install dependencies

```bash
npm install
```

This pulls `electron` and `electron-builder` (a few hundred MB the first time).

## 2. Verify it runs (dev mode)

```bash
npm run electron
```

This should open the POS window. Behind it, Electron starts the bundled server
on a free port with a per-user data directory. **This is also the `node:sqlite`
spike:** if the window loads the catalogue, `node:sqlite` works inside Electron.
If instead you get a "server did not start" error, check the terminal for a
`node:sqlite` message and see *Troubleshooting* below.

## 3. Build the installer

```bash
npm run dist
```

electron-builder produces the installer under `dist/` (e.g.
`dist/Chop Chop POS Setup 2.0.0.exe`). Run it to install; it creates the
desktop shortcut. Uninstall via Windows "Apps & features".

## How it works when installed

- The app stores its database in the per-user data folder
  (`%APPDATA%/Chop Chop POS/gckpos.db`), which is writable — the install
  folder itself is read-only.
- On launch it picks a free port, starts `server/server.js` as a child process
  (Electron's own Node, `--experimental-sqlite`), waits for `/api/health`, then
  opens the window at `http://localhost:<port>`.
- Closing the window stops the server.

## Cashier phones (opt-in)

By default the app is **local only** — nothing is exposed to the network.

1. In the app menu: **Phones → Allow phones on Wi-Fi** (tick it). The server
   restarts in LAN mode and shows the phone address.
2. **Phones → Show phone address…** displays e.g. `http://192.168.0.101:<port>`.
3. On a phone connected to the **same Wi-Fi**, open that address in its browser
   and sign in with a PIN. Sales sync to the shared database.

Notes:
- **Windows Firewall** will likely prompt the first time — click **Allow** on
  private networks, or phones can't connect.
- The till's IP can change (DHCP); reserve a static IP for a stable phone URL.
- **Security:** the API has no login yet, so only enable phone access on a
  trusted private Wi-Fi. Server-side login (PIN → token) + hashed PINs is the
  next security task (see `docs/SECURITY.md`).

## Troubleshooting

- **`npm run dist` fails with "Cannot create symbolic link: A required privilege
  is not held by the client"** — electron-builder's `winCodeSign` helper contains
  macOS symlinks that Windows only lets privileged users extract. The app still
  packages to `dist/win-unpacked/` (runnable directly); only the installer step
  fails. Fix by granting the privilege, then re-run `npm run dist`:
  - **Turn on Windows Developer Mode** (Settings → Privacy & security → For
    developers → Developer Mode = On), **or**
  - run the terminal **as Administrator**.
  Once `winCodeSign` extracts once, it is cached and later builds succeed.
- **"server did not start" / node:sqlite error** — Electron's bundled Node must
  include `node:sqlite` (Node 22.5+; Electron 43 ships Node 22). If a future
  Electron changes the flag handling, the fix is in `electron/main.js`
  (`startServer` — the `--experimental-sqlite` argument, or fall back to
  spawning a system Node 22+).
- **Phone can't connect** — confirm phone access is on, both devices are on the
  same Wi-Fi, and the firewall prompt was allowed.
- **Port in use** — Electron picks a free port automatically; the standalone
  `npm start` server also hunts upward from 4000.

## Status

The Electron wrapper, build config, and phone-access flow are in place. The
`node:sqlite`-in-Electron spike and the actual installer build must be run on a
Windows machine (step 2/3) — they cannot run in a headless sandbox.
