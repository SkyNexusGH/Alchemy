# Security

## Reporting a vulnerability

Please report security problems privately through GitHub's
[private vulnerability reporting](https://github.com/SkyNexusGH/Ovyra/security/advisories/new) rather than in a public
issue. Include the Ovyra version (Settings → About Ovyra) and the steps to reproduce it. You'll get a reply as soon as
possible, and fixes ship through Ovyra's automatic updates.

## How Ovyra is built to be safe

- **Every web page runs sandboxed** with context isolation and no Node.js access, exactly like in Chrome.
- **The browser UI is separate from the web.** Ovyra's own pages are served from the `ovyra://` scheme, and the
  internal messaging (IPC) only answers requests that come from Ovyra's own pages.
- **Hardened app binary.** Release builds turn off Electron's developer escape hatches with
  [fuses](https://www.electronjs.org/docs/latest/tutorial/fuses): no running as plain Node.js, no `NODE_OPTIONS`, no
  debugger flags, app code is only loaded from the integrity-checked `app.asar`, and cookies are encrypted at rest.
- **Up to date Chromium.** Ovyra follows Electron's stable releases, and every installed copy updates itself.
- **Permissions** (camera, microphone, location, notifications…) are asked per site and can be reset in Settings.
