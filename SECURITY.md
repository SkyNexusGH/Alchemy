# Security

## Reporting a vulnerability

Please report security problems privately through GitHub's
[private vulnerability reporting](https://github.com/SkyNexusGH/Alchemy/security/advisories/new) rather than in a public
issue. Include the Alchemy version (Settings → About Alchemy) and the steps to reproduce it. You'll get a reply as soon as
possible, and fixes ship through Alchemy's automatic updates.

## How Alchemy is built to be safe

- **Every web page runs sandboxed** with context isolation and no Node.js access, exactly like in Chrome.
- **The browser UI is separate from the web.** Alchemy's own pages are served from the `alchemy://` scheme, and the
  internal messaging (IPC) only answers requests that come from Alchemy's own pages.
- **Hardened app binary.** Release builds turn off Electron's developer escape hatches with
  [fuses](https://www.electronjs.org/docs/latest/tutorial/fuses): no running as plain Node.js, no `NODE_OPTIONS`, no
  debugger flags, app code is only loaded from the integrity-checked `app.asar`, and cookies are encrypted at rest.
- **Up to date Chromium.** Alchemy follows Electron's stable releases, and every installed copy updates itself.
- **Permissions** (camera, microphone, location, notifications…) are asked per site and can be reset in Settings.
