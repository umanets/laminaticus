# Laminaticus — REST-style HTTP API for 1C 7.7 + near-realtime Telegram bot

A working Windows application that exposes data from **1C:Enterprise 7.7** (legacy `V77.Application` OLE/COM automation) through a small **REST-style HTTP API** and feeds it, near-realtime, to a **Telegram bot**.

1C 7.7 has no web services, no REST, no HTTP — the only way in is 32-bit COM/OLE automation. Laminaticus bridges that gap: an external report (`.ert`, "внешняя обработка") inside 1C dumps inventory data to XML on demand, a Node.js service triggers it over HTTP, a watcher loads the XML into PostgreSQL, and a Telegram bot serves it to end users with search, reservations, and price lists.

> Strictly speaking the API is not full REST — it is a single HTTP endpoint that triggers a 1C report export. But if you are searching for "1C 7.7 REST", "1C 7.7 HTTP API", or "get data out of 1C 7.7 programmatically" — this is the working pattern.

**Keywords:** 1C 7.7 REST API · 1C:Enterprise 7.7 HTTP · V77.Application OLE automation · winax · external report .ert · 1C Telegram bot · near-realtime 1C export

## How it works

```
┌─────────────┐   OLE/COM (32-bit)   ┌──────────────────┐
│  1C 7.7     │◄─────────────────────│  one-s-rest      │◄── GET /retrieve-xml
│ + Tgauto.ert│   V77.Application    │  (Express, :3001)│      (scheduler, every N min)
└─────────────┘                      └──────────────────┘
      │ writes
      ▼
 data/report.xml ──► report-watcher ──► PostgreSQL (reports table)
                     (chokidar + xml2js)        │
                                                ▼
                                    demo-telegram-bot (Telegraf)
                                    search · reservations · price lists
                                    email notifications via SMTP
```

1. **`one-s-rest`** — Express server on port **3001** with one endpoint: `GET /retrieve-xml`. On each call it spawns a 32-bit Node child process that opens 1C via `new COMObject('V77.Application')` (the [winax](https://github.com/durs/node-activex) native module), runs the external report `Tgauto.ert`, and lets it write `data/report.xml`. COM calls are blocking and can hang, so the 1C session lives in an isolated child process with a 30-second timeout and forced `taskkill` cleanup of stuck 1C instances.
2. **`one-s-rest/scheduler.js`** — polls `/retrieve-xml` every `RETRIEVE_INTERVAL_MINUTES`, which makes the pipeline near-realtime.
3. **`report-watcher`** — watches `data/report.xml`, parses it, enriches rows with category/brand from `mappings.json`, and refreshes the `reports` table in PostgreSQL (full truncate + insert on every export).
4. **`demo-telegram-bot`** — Telegraf (TypeScript) bot reading from PostgreSQL. Features: product search by name/article with catalog & brand filters, quantity reservations with a status workflow (Waiting → Processing → Exported/Cancelled), price list files, role-based access (unauthorized / authorized / admin with an approval flow), and email notifications on reservation changes (SMTP, Mailjet). If 1C is unreachable (`data/error.log` exists), the bot warns users that data may be stale.
5. **Electron UI** — a small desktop control panel: start/stop the scheduler, live logs of all services, price file uploads (PDF/DOC/CSV/XML/XLS…) into `data/prices/`, open-data-folder button, and auto-update from GitHub releases (electron-updater). See [autoupdater-README.md](autoupdater-README.md).
6. **`laminaticus-runner`** — process supervisor that launches the three services (`BOT`, `API`, `REPORT`) with prefixed unified log output.

## Repository layout

| Path | What it is |
|---|---|
| `main.js`, `renderer.js`, `index.html` | Electron control-panel app |
| `one-s-rest/` | HTTP API to 1C 7.7 (Express + winax COM bridge) and the scheduler |
| `report-watcher/` | XML → PostgreSQL loader |
| `demo-telegram-bot/` | Telegram bot (Telegraf, TypeScript) |
| `laminaticus-runner/` | Spawns and supervises the three services |
| `db/init/` | PostgreSQL schema (`reports` table), auto-applied by Docker |
| `prebuild/winax/` | Prebuilt 32-bit winax native module (skips node-gyp rebuild on install) |
| `node32/` | Bundled 32-bit Node.js (created by `install.ps1`; COM requires ia32) |
| `docker-compose.yml` | PostgreSQL 15 container |

## Requirements

- Windows with **1C:Enterprise 7.7** installed and a database the service user can open
- The external report `Tgauto.ert` placed in the 1C `ExtForms` folder
- Docker Desktop (for PostgreSQL)
- 32-bit Node.js — installed automatically by `install.ps1` into `node32/` (COM automation of 1C 7.7 only works from a 32-bit process)

## Install

```powershell
Set-ExecutionPolicy RemoteSigned -Scope Process
.\install.ps1
```

This downloads 32-bit Node.js into `node32/`, runs `npm install` for all services, and copies the prebuilt `winax` module into `one-s-rest/node_modules`.

To rebuild `winax` from source for 32-bit instead of using the prebuilt one:

```powershell
$env:PATH = "D:\work\laminaticus\node32;" + $env:PATH
npm i
npm rebuild --arch=ia32
```

## Configure

Copy `.env.sample` to `.env` and fill in:

- `BOT_TOKEN` — Telegram bot token
- `REPORT_DB_CONFIGURATION` — path to the 1C 7.7 database folder
- `REPORT_MODULE_PATH` — path to `Tgauto.ert`
- `REPORT_USER` / `REPORT_PASSWORD` — 1C service user credentials
- `RETRIEVE_INTERVAL_MINUTES` — how often to pull data from 1C
- `EMAIL_*`, `NOTIFICATION_EMAIL` — SMTP settings for reservation notifications (Mailjet)

PostgreSQL connection defaults (match `docker-compose.yml`): `PGHOST=localhost`, `PGPORT=5432`, `PGUSER=laminaticus`, `PGPASSWORD=laminaticus_pass`, `PGDATABASE=laminaticus`.

## Run

Start the database:

```bash
docker-compose up -d
```

**With the UI** (recommended): `runui.bat` — starts the Electron control panel, which brings up Docker and all services, and lets you start/stop the scheduler.

**Manual mode** (no UI):

```bash
run-services.bat
node32\node.exe one-s-rest\scheduler.js
```

## Build & release

```bash
npm run package-win   # portable build via electron-packager → release-builds/
npm run dist          # installer via electron-builder → dist/
npm run publish       # build + publish a GitHub release (auto-update feed)
```

Installed apps check GitHub releases and offer in-app updates — details in [autoupdater-README.md](autoupdater-README.md).

## Data notes

- All runtime data lives in the app data directory (overridable with `USER_DATA_DIR`): `report.xml`, `error.log`, `mappings.json`, `prices/`.
- The `reports` table is fully replaced on every 1C export — PostgreSQL always mirrors the latest 1C state; there is no history.
- `mappings.json` maps products to categories and brands for the bot's filters.
