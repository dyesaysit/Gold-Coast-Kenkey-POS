/*
 * electron/preload.js
 * Intentionally minimal. The window loads the normal web app, which talks to its
 * own local server over HTTP — it needs no privileged Electron APIs. This file
 * exists so contextIsolation stays on with nodeIntegration off (the secure
 * default), and gives a place to expose a narrow bridge later if needed.
 */
"use strict";

// No APIs are exposed to the page.
