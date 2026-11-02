# Ovyra privacy policy

**Short version: Ovyra has no servers, no accounts, no analytics and no telemetry. Everything you do stays on your
computer.** This page lists every connection Ovyra itself makes, so you can check that for yourself in the source code.

## What Ovyra stores, and where

Everything lives in your Windows profile, in `%APPDATA%\Ovyra`, and nowhere else:

| What | File | Notes |
| --- | --- | --- |
| Settings, workspaces, speed dial | `settings.json` | |
| History | `history.json` | Clear it any time in Settings → Privacy, or per entry on the History page |
| Bookmarks | `bookmarks.json` | |
| Open tabs (to restore them) | `session.json` | Private windows are never saved |
| Downloads list, site permissions, per-site shield choices | `downloads.json`, `permissions.json`, `shields.json` | |
| Cookies, site data, cache | Chromium's own folders | Cookies are encrypted with Windows' data protection (DPAPI) |
| Ad-blocking filter lists | `filters-full.bin` | Public lists, nothing personal |

Private windows keep everything in memory and write nothing to disk. Uninstalling Ovyra leaves this folder in place
so a reinstall keeps your data; delete the folder to remove it completely.

## Every connection Ovyra makes on its own

Apart from the websites you visit, Ovyra only ever connects to:

| Where | Why | What it sends |
| --- | --- | --- |
| The filter list hosts (EasyList, uBlock Origin's lists on GitHub, Peter Lowe's list, URLhaus) | Download ad and tracker blocking lists, about once a day | Nothing but a normal download request; no cookies |
| `github.com` (Ovyra's releases) | Check for and download updates, every few hours | Nothing but a normal download request; no cookies |
| Your search engine's suggestion service | Search suggestions while you type in the address bar | What you type, **only** with suggestions on (Settings → New Tab & Search), from a separate session without your cookies |
| The sites in your sidebar | Fetch their icons once, so the sidebar looks right | A request for `/favicon.ico`, without cookies |
| The Chrome Web Store | Only when you install or update an extension | The extension's ID |

There is no crash reporting, usage tracking, "phone home", experiment system, or advertising ID. Ovyra is built on
Electron, which (unlike Google Chrome) contains none of Google's services: no Safe Browsing lookups, no sync, no usage
statistics.

## Protections that are on by default

- Ads, trackers and malware domains blocked with uBlock Origin's filter lists
- Third-party cookies blocked
- HTTPS upgrades for sites that support it
- Fingerprinting protection (canvas, audio and hardware details are randomized per site)
- Global Privacy Control sent to every site
- WebRTC limited to the public network route, so sites can't read your local IP addresses
- DNS over HTTPS whenever your DNS provider supports it
- Search suggestions sent without cookies

## Extensions

Chrome extensions you install can read and change websites according to their permissions, the same as in Chrome.
Ovyra asks before installing one. Extensions are not loaded in private windows.

## Open source

Ovyra's full source code is public at <https://github.com/SkyNexusGH/Ovyra>, so anyone can verify everything on this
page. If you find Ovyra sending something not listed here, please [open an issue](https://github.com/SkyNexusGH/Ovyra/issues):
it's a bug.
