<p align="center"><img src="resources/icon.png" width="96" alt="Ovyra logo"></p>

<h1 align="center">Ovyra</h1>

<p align="center">A fast, private, colorful browser for Windows: Opera's best ideas, Brave-level privacy, real Chromium underneath.</p>

## Features

- **Real Chromium** (via Electron) — sites work exactly like in Chrome.
- **Built-in ad & tracker blocking** using uBlock Origin's filter lists, with a per-site shield, cookie-banner hiding, HTTPS upgrades, third-party cookie blocking, fingerprinting protection and Global Privacy Control.
- **Workspaces**, each with its own tabs and color theme.
- **Tab islands** — tabs opened from the same page group together and can be folded away.
- **Messenger sidebar** — WhatsApp, Telegram, Discord, Spotify and any site, docked beside your page with unread badges.
- **Video popout** — float any video above your other windows.
- **Split view**, a **Ctrl+K command palette**, and **Chrome Web Store extensions**.
- **Sleeping tabs** and lazy session restore to keep memory use down.
- **Private windows** that leave nothing behind.
- **Import** bookmarks, history and speed dial from Opera, Opera GX, Brave, Chrome and Edge.
- **Automatic updates** in the background — no reinstalling.

## Install

Download `Ovyra-Setup-x.y.z.exe` from the [latest release](https://github.com/SkyNexusGH/Ovyra/releases/latest) and run it.
Ovyra checks for new versions every few hours, downloads them quietly, and shows an **Update** button when one is ready
(it also installs on the next restart).

> The installer isn't code-signed yet, so Windows SmartScreen may warn the first time: choose *More info → Run anyway*.

## Development

```bash
npm install
npm run dev        # run with hot reload
npm run typecheck
npm run dist       # build dist/Ovyra-Setup-<version>.exe locally
```

## Releasing an update

```bash
npm run release    # bumps the patch version, tags it and pushes
```

Pushing a `vX.Y.Z` tag runs the [Release workflow](.github/workflows/release.yml), which builds the installer and publishes
it as a GitHub Release. Every installed copy picks it up automatically.

## Project layout

| Path | What's there |
| --- | --- |
| `src/main` | Browser engine side: windows, tabs, privacy, panels, extensions, updates, storage |
| `src/preload` | Bridges for the browser UI and the per-frame privacy / video popout scripts |
| `src/renderer` | The UI (React): tab strip, address bar, side rail, overlays and internal pages |
| `src/shared` | Types and helpers used on both sides |

## Privacy and license

Ovyra is free and open source under the [Mozilla Public License 2.0](LICENSE) (the same license as Firefox).
It has no accounts, analytics or telemetry; [PRIVACY.md](PRIVACY.md) lists every connection it makes, and
[SECURITY.md](SECURITY.md) explains how to report a vulnerability.

The original prototype is preserved in the [`original` branch](https://github.com/SkyNexusGH/Ovyra/tree/original) and the
[original-attempt release](https://github.com/SkyNexusGH/Ovyra/releases/tag/original-attempt).
